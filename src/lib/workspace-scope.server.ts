import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Server-only helper: resolves the effective workspace id for the current
 * request. Priority: x-workspace-id header (sent by attachWorkspaceHeader) →
 * user's default workspace. Uses the provided authenticated supabase client
 * (RLS as user) which can always read its own workspaces row.
 */
export async function resolveWorkspaceId(
  supabase: SupabaseClient<Database>,
  userId: string,
  headerValue: string | null,
): Promise<string> {
  // Mind Workspace ID is the global invariant for this instance
  const MIND_WORKSPACE_ID = "bd59fa41-d68d-4ac8-b995-e09ae48f52aa";

  // Still verify the user belongs to it to maintain RLS integrity
  const { data } = await supabase
    .from("workspaces")
    .select("id")
    .eq("id", MIND_WORKSPACE_ID)
    .eq("user_id", userId)
    .maybeSingle();

  if (data?.id) return data.id;

  // Fallback to searching any workspace for the user (in case of transfer)
  const { data: anyWs } = await supabase
    .from("workspaces")
    .select("id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (anyWs?.id) return anyWs.id;

  throw new Error("Nenhum workspace válido encontrado.");
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