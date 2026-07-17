import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listWorkspaces } from "@/lib/workspaces.functions";
import { MIND_WORKSPACE_ID } from "@/lib/tenant-config";

export type Workspace = {
  id: string;
  nome: string;
  icone: string;
  cor: string;
  is_default: boolean;
  created_at?: string;
};

type WorkspaceContextValue = {
  activeWorkspaceId: string;
  activeWorkspace: Workspace | null;
  workspaces: Workspace[];
  isLoading: boolean;
  switchWorkspace: (id: string) => void;
  refresh: () => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

/**
 * Global getter used by the client function middleware to attach the
 * x-workspace-id header to every server function call.
 * This is now hardcoded to the Mind workspace ID.
 */
export function getActiveWorkspaceIdFromStorage(): string {
  return MIND_WORKSPACE_ID;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const fetchWorkspaces = useServerFn(listWorkspaces);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setHasSession(!!data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setHasSession(!!session);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const workspacesQ = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => fetchWorkspaces(),
    enabled: hasSession,
    staleTime: Infinity, // Single-tenant workspace list rarely changes
  });

  const workspaces = (workspacesQ.data ?? []) as Workspace[];
  const activeWorkspace = workspaces.find((w) => w.id === MIND_WORKSPACE_ID) ?? null;

  const switchWorkspace = useCallback(
    (_id: string) => {
      // In single-tenant mode, switching is disabled or forced to Mind
      console.log("[WorkspaceContext] switchWorkspace called but ignored (Single-Tenant Mode)");
    },
    [],
  );

  return (
    <WorkspaceContext.Provider
      value={{
        activeWorkspaceId: MIND_WORKSPACE_ID,
        activeWorkspace,
        workspaces,
        isLoading: workspacesQ.isLoading,
        switchWorkspace,
        refresh: () => qc.invalidateQueries({ queryKey: ["workspaces"] }),
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  }
  return ctx;
}