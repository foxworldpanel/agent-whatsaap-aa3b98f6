import { createServerFn } from "@tanstack/react-start";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";
import { fetchAllSupabaseRows } from "@/lib/supabase-pagination";
import { z } from "zod";

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
  if (!have.has("meta_ads")) missing.push({ user_id: userId, nome: "Meta ADS [Geral]", cor: "blue", icone: "📣", slug: "meta_ads", is_system: true });
  if (!have.has("lead_instagram")) missing.push({ user_id: userId, nome: "Instagram CSV", cor: "pink", icone: "📷", slug: "lead_instagram", is_system: true });
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

function toSlug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "categoria";
}

export const createCategory = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) =>
    z.object({
      nome: z.string().min(1).max(40),
      icone: z.string().max(4).optional(),
      cor: z.string().max(20).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const slugBase = toSlug(data.nome);
    const { data: row, error } = await context.supabase
      .from("contact_categories")
      .insert({
        user_id: context.userId,
        nome: data.nome,
        cor: data.cor ?? "blue",
        icone: data.icone ?? "🏷️",
        slug: `${slugBase}_${Date.now().toString(36)}`,
        is_system: false,
      })
      .select("id, nome, cor, icone, slug, is_system")
      .single();
    if (error) throw new Error(error.message);
    return row as ContactCategory;
  });

// Retorna categorias + um mapa telefone -> categoria_id derivado de
// blast_contacts (que é onde a categorização de leads Meta Ads vive).
// Usado pela tela Contatos pra permitir filtrar por sub-categoria (ex.:
// "Meta Ads - Spotify", "Meta Ads - YouTube").
export const listContactCategoryMap = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as import("@supabase/supabase-js").SupabaseClient<import("@/integrations/supabase/types").Database>;
    await ensureDefaults(sb, context.userId);
    const [catsRes, mapRows] = await Promise.all([
      sb.from("contact_categories")
        .select("id, nome, cor, icone, slug, is_system")
        .eq("user_id", context.userId)
        .order("is_system", { ascending: false })
        .order("nome", { ascending: true }),
      fetchAllSupabaseRows<{ telefone: string | null; categoria_id: string | null }>((from, to) =>
        sb.from("blast_contacts")
          .select("telefone, categoria_id")
          .eq("user_id", context.userId)
          .not("categoria_id", "is", null)
          .range(from, to),
      ),
    ]);
    const byPhone: Record<string, string> = {};
    for (const r of mapRows) {
      if (r.telefone && r.categoria_id) byPhone[r.telefone] = r.categoria_id;
    }
    return {
      categorias: (catsRes.data ?? []) as ContactCategory[],
      byPhone,
    };
  });