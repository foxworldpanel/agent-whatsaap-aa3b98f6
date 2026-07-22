import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// Single-tenant project: only this workspace id is allowed by the
// check_single_tenant_workspace DB trigger. Used as a last-resort fallback
// so authenticated users without their own workspace row (e.g. secondary
// admin accounts) can still reach workspace-scoped server functions.
const MIND_WORKSPACE_ID = "bd59fa41-d68d-4ac8-b995-e09ae48f52aa";

/**
 * Server-only helper: resolves the effective workspace id for the current
 * request. Priority: x-workspace-id header (sent by attachWorkspaceHeader) →
 * user's default workspace → singleton Mind workspace fallback. Uses the
 * provided authenticated supabase client (RLS as user) which can always
 * read its own workspaces row.
 */
export async function resolveWorkspaceId(
  supabase: SupabaseClient<Database>,
  userId: string,
  headerValue: string | null,
): Promise<string> {
  const hdr = headerValue?.trim();
  if (hdr && /^[0-9a-f-]{36}$/i.test(hdr)) {
    // Trust after user_owns_workspace check
    const { data } = await supabase
      .from("workspaces")
      .select("id")
      .eq("id", hdr)
      .eq("user_id", userId)
      .maybeSingle();
    if (data?.id) return data.id;
    // Header requested the singleton Mind workspace but this user doesn't
    // own it — allow it anyway (single-tenant project).
    if (hdr.toLowerCase() === MIND_WORKSPACE_ID) return MIND_WORKSPACE_ID;
  }
  const { data, error } = await supabase
    .from("workspaces")
    .select("id")
    .eq("user_id", userId)
    .eq("is_default", true)
    .maybeSingle();
  if (error || !data?.id) {
    // If no default found, check if ANY workspace exists for this user
    const { data: anyWs } = await supabase
      .from("workspaces")
      .select("id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (anyWs?.id) return anyWs.id;

    // Single-tenant fallback: the DB trigger enforces that only the Mind
    // workspace id can exist, so any authenticated user maps to it.
    return MIND_WORKSPACE_ID;
  }
  return data.id;
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