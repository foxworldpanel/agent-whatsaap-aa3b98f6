import { createServerFn } from "@tanstack/react-start";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";

export type ContactCategory = {
  id: string;
  nome: string;
  cor: string;
  icone: string;
  slug: string;
  is_system: boolean;
};

async function ensureDefaults(
  supabase: import("@supabase/supabase-js").SupabaseClient<import("@/integrations/supabase/types").Database>,
  userId: string,
) {
  const { data } = await supabase
    .from("contact_categories")
    .select("slug")
    .eq("user_id", userId);
  const have = new Set((data ?? []).map((r) => r.slug as string));
  const missing: Array<{ user_id: string; nome: string; cor: string; icone: string; slug: string; is_system: boolean }> = [];
  if (!have.has("meta_ads")) missing.push({ user_id: userId, nome: "Meta Ads", cor: "blue", icone: "📣", slug: "meta_ads", is_system: true });
  if (!have.has("lead_instagram")) missing.push({ user_id: userId, nome: "Lead Instagram", cor: "pink", icone: "📷", slug: "lead_instagram", is_system: true });
  if (missing.length) await supabase.from("contact_categories").insert(missing);
}

export const listCategories = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as import("@supabase/supabase-js").SupabaseClient<import("@/integrations/supabase/types").Database>;
    await ensureDefaults(sb, context.userId);
    const { data } = await sb
      .from("contact_categories")
      .select("id, nome, cor, icone, slug, is_system")
      .eq("user_id", context.userId)
      .order("is_system", { ascending: false })
      .order("nome", { ascending: true });
    return (data ?? []) as ContactCategory[];
  });