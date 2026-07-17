import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { MIND_WORKSPACE_ID } from "./tenant-config";

/**
 * Server-only helper: resolves the effective workspace id for the current
 * request. In single-tenant mode, this always returns the Mind workspace ID
 * after verifying the user has access to it.
 */
export async function resolveWorkspaceId(
  supabase: SupabaseClient<Database>,
  _userId: string,
  _headerValue: string | null,
): Promise<string> {
  // Verificamos se o usuário tem acesso ao workspace Mind.
  // Como agora só existe um workspace, o usuário logado deve ser membro/owner dele.
  const { data, error } = await supabase
    .from("workspaces")
    .select("id")
    .eq("id", MIND_WORKSPACE_ID)
    .maybeSingle();

  if (error || !data?.id) {
    throw new Error("Acesso negado: Você não possui permissão para acessar o workspace Mind.");
  }

  return MIND_WORKSPACE_ID;
}

/**
 * Wraps a supabase-js fetch to forward x-workspace-id on every PostgREST call
 * so RLS policies can read it via current_setting('request.headers').
 */
export function withWorkspaceHeaderFetch(
  baseFetch: typeof fetch,
  workspaceId: string,
): typeof fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set("x-workspace-id", workspaceId);
    return baseFetch(input, { ...init, headers });
  };
}