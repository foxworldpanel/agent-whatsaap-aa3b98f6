import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listWorkspaces } from "@/lib/workspaces.functions";

export type Workspace = {
  id: string;
  nome: string;
  icone: string;
  cor: string;
  is_default: boolean;
  created_at?: string;
};

type WorkspaceContextValue = {
  activeWorkspaceId: string | null;
  activeWorkspace: Workspace | null;
  workspaces: Workspace[];
  isLoading: boolean;
  switchWorkspace: (id: string) => void;
  refresh: () => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);
const STORAGE_KEY = "lovable.activeWorkspaceId";

function readStored(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Global getter used by the client function middleware to attach the
 * x-workspace-id header to every server function call. Reads from localStorage
 * so it works even outside React (middleware runs before providers mount).
 */
export function getActiveWorkspaceIdFromStorage(): string | null {
  return readStored();
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const fetchWorkspaces = useServerFn(listWorkspaces);
  const [hasSession, setHasSession] = useState(false);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(() => readStored());

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
    staleTime: 30_000,
  });

  const workspaces = (workspacesQ.data ?? []) as Workspace[];

  // Ensure activeWorkspaceId is valid; fall back to default.
  useEffect(() => {
    if (!workspaces.length) return;
    const stored = activeWorkspaceId;
    const isValid = stored && workspaces.some((w) => w.id === stored);
    if (!isValid) {
      const def = workspaces.find((w) => w.is_default) ?? workspaces[0];
      if (def) {
        setActiveWorkspaceId(def.id);
        try {
          window.localStorage.setItem(STORAGE_KEY, def.id);
        } catch {
          /* ignore */
        }
      }
    }
  }, [workspaces, activeWorkspaceId]);

  const switchWorkspace = useCallback(
    (id: string) => {
      if (id === activeWorkspaceId) return;
      setActiveWorkspaceId(id);
      try {
        window.localStorage.setItem(STORAGE_KEY, id);
      } catch {
        /* ignore */
      }
      // Blow away every cached query so nothing from the previous workspace leaks.
      qc.clear();
    },
    [activeWorkspaceId, qc],
  );

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? null;

  return (
    <WorkspaceContext.Provider
      value={{
        activeWorkspaceId,
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