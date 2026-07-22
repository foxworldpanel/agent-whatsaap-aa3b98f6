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

  // Ensure activeWorkspaceId is valid; fall back to default or singleton Mind.
  useEffect(() => {
    if (!hasSession) return;
    if (workspacesQ.isLoading) return;
    
    const MIND_ID = "bd59fa41-d68d-4ac8-b995-e09ae48f52aa";
    
    // Check if we have a Mind workspace available in the fetched list
    const mindInList = workspaces.find((w) => w.id === MIND_ID || /mind/i.test(w.nome));
    const stored = activeWorkspaceId;
    const currentIsValid = stored && (workspaces.some((w) => w.id === stored) || stored === MIND_ID);

    // If we found a Mind workspace in the list but it's not the active one, force it
    if (mindInList && activeWorkspaceId !== mindInList.id) {
      console.log(`[WorkspaceContext] Switching to Mind workspace from list: ${mindInList.id}`);
      setActiveWorkspaceId(mindInList.id);
      try {
        window.localStorage.setItem(STORAGE_KEY, mindInList.id);
      } catch (err) {
        console.error("[WorkspaceContext] Failed to store activeWorkspaceId", err);
      }
      void qc.invalidateQueries({ refetchType: "all" });
      return;
    }

    // If no valid workspace is active, fall back
    if (!currentIsValid) {
      // 1. Mind in list, 2. Default in list, 3. First in list, 4. Singleton Mind Hardcode
      const def = mindInList ?? workspaces.find((w) => w.is_default) ?? workspaces[0];
      const fallbackId = def?.id || MIND_ID;

      console.log(`[WorkspaceContext] Falling back to workspace: ${fallbackId}`);
      setActiveWorkspaceId(fallbackId);
      try {
        window.localStorage.setItem(STORAGE_KEY, fallbackId);
      } catch (err) {
        console.error("[WorkspaceContext] Failed to store activeWorkspaceId", err);
      }
      void qc.invalidateQueries({ refetchType: "all" });
    }
  }, [workspaces, workspacesQ.isLoading, activeWorkspaceId, qc, hasSession]);

  const switchWorkspace = useCallback(
    (id: string) => {
      if (id === activeWorkspaceId) return;
      setActiveWorkspaceId(id);
      try {
        window.localStorage.setItem(STORAGE_KEY, id);
      } catch {
        /* ignore */
      }
      // Mark all active queries stale and refetch them with the new
      // x-workspace-id header. Do NOT removeQueries() first — that detaches
      // observers and leaves nothing to invalidate/refetch.
      void qc.invalidateQueries({ refetchType: "all" });
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