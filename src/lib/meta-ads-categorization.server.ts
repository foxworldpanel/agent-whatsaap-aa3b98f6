// Auto-categorização de leads Meta Ads a partir do texto da 1ª mensagem.
// A tabela `meta_ads_trigger_rules` (workspace-scoped, editável pelo
// usuário) define pares "padrão de texto → categoria de destino". Ordem:
// priority DESC. Casamento por substring case-insensitive.
// Fallback: se nada bater (ou tabela vazia), cai na categoria genérica
// "meta_ads" (mesmo comportamento anterior).

export type TriggerRule = {
  pattern: string;
  category_slug: string;
  category_nome: string;
  category_cor: string;
  category_icone: string;
  priority: number;
  active: boolean;
};

export function matchTriggerRule(
  messageText: string | null | undefined,
  rules: TriggerRule[],
): TriggerRule | null {
  const text = (messageText ?? "").toLowerCase().trim();
  if (!text) return null;
  const sorted = [...rules]
    .filter((r) => r.active && r.pattern.trim().length > 0)
    .sort((a, b) => b.priority - a.priority);
  for (const r of sorted) {
    if (text.includes(r.pattern.toLowerCase().trim())) return r;
  }
  return null;
}

// Resolve a categoria (existente ou recém-criada) a partir do texto da
// mensagem. Retorna o id da contact_categories que deve ser usada.
export async function resolveMetaAdsCategoryId(
  userId: string,
  messageText: string | null | undefined,
): Promise<string | undefined> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: rulesRaw } = await supabaseAdmin
    .from("meta_ads_trigger_rules" as never)
    .select(
      "pattern, category_slug, category_nome, category_cor, category_icone, priority, active",
    )
    .eq("user_id", userId);

  const match = matchTriggerRule(messageText, (rulesRaw as TriggerRule[] | null) ?? []);

  const target = match
    ? {
        slug: match.category_slug,
        nome: match.category_nome,
        cor: match.category_cor,
        icone: match.category_icone,
      }
    : { slug: "meta_ads", nome: "Meta ADS [Geral]", cor: "blue", icone: "📣" };

  const { data: cat } = await supabaseAdmin
    .from("contact_categories")
    .select("id")
    .eq("user_id", userId)
    .eq("slug", target.slug)
    .maybeSingle();
  if (cat?.id) return cat.id;

  const ins = await supabaseAdmin
    .from("contact_categories")
    .insert({
      user_id: userId,
      nome: target.nome,
      cor: target.cor,
      icone: target.icone,
      slug: target.slug,
      is_system: target.slug === "meta_ads",
    })
    .select("id")
    .single();
  return ins.data?.id ?? undefined;
}
