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

    // Nenhum workspace existe para este usuário → cria um padrão automaticamente.
    // Isso evita telas em branco no primeiro acesso após o signup.
    // Em caso de corrida (várias server fns paralelas no primeiro request),
    // o INSERT pode falhar por unique constraint — refetch e retorna o existente.
    const { data: created, error: createErr } = await supabase
      .from("workspaces")
      .insert({
        user_id: userId,
        nome: "Meu workspace",
        is_default: true,
      })
      .select("id")
      .single();
    if (created?.id) return created.id;

    // Corrida: outro handler já criou. Refetch qualquer workspace do usuário.
    const { data: existing } = await supabase
      .from("workspaces")
      .select("id")
      .eq("user_id", userId)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing?.id) return existing.id;

    throw new Error(
      `No default workspace found for user and auto-create failed: ${createErr?.message ?? "unknown"}`,
    );
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