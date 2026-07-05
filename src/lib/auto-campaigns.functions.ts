import { createServerFn } from "@tanstack/react-start";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";
import { z } from "zod";

export const DEFAULT_AUTO_CAMPAIGNS = [
  {
    key: "pos_compra_24h",
    name: "Pós-compra (24h)",
    trigger_type: "after_purchase",
    trigger_hours: 24,
    message_template:
      "Oi {nome}! Seu pedido foi entregue 😊 Ficou bom? Se quiser renovar ou turbinar outra rede, é só me chamar!",
  },
  {
    key: "reativacao_7d",
    name: "Reativação 7 dias",
    trigger_type: "inactive",
    trigger_hours: 24 * 7,
    message_template:
      "Oi {nome}! Sumiu hein 😄 Tô aqui se precisar impulsionar algo. Como tá o perfil?",
  },
  {
    key: "reativacao_15d",
    name: "Reativação 15 dias (oferta)",
    trigger_type: "inactive",
    trigger_hours: 24 * 15,
    message_template:
      "Oi {nome}! Tenho uma condição especial essa semana pra você. Quer ver?",
  },
  {
    key: "reativacao_30d",
    name: "Reativação 30 dias (prova social)",
    trigger_type: "inactive",
    trigger_hours: 24 * 30,
    message_template:
      "Oi {nome}! Muita gente cresceu bastante esse mês com a gente 🚀 Quer dar uma turbinada no seu perfil também?",
  },
  {
    key: "upsell_pos_teste_2h",
    name: "Upsell pós-teste grátis (2h)",
    trigger_type: "after_free_trial",
    trigger_hours: 2,
    message_template:
      "Oi {nome}! Seu teste de 100 views foi entregue! Sentiu a diferença? Quer continuar crescendo? 😊",
  },
] as const;

export const listAutoCampaigns = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("auto_campaigns")
      .select("*")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    const existing = new Map((data ?? []).map((r) => [r.key, r]));
    const missing = DEFAULT_AUTO_CAMPAIGNS.filter((d) => !existing.has(d.key));
    if (missing.length > 0) {
      const rows = missing.map((m) => ({ ...m, user_id: context.userId, enabled: false }));
      const { error: insErr } = await context.supabase.from("auto_campaigns").insert(rows);
      if (insErr) throw new Error(insErr.message);
      const { data: refreshed } = await context.supabase
        .from("auto_campaigns")
        .select("*")
        .eq("user_id", context.userId);
      return (refreshed ?? []).sort(byDefaultOrder);
    }
    return (data ?? []).sort(byDefaultOrder);
  });

function byDefaultOrder(a: { key: string }, b: { key: string }) {
  const order: string[] = DEFAULT_AUTO_CAMPAIGNS.map((d) => d.key);
  return order.indexOf(a.key) - order.indexOf(b.key);
}

export const updateAutoCampaign = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        enabled: z.boolean().optional(),
        message_template: z.string().min(1).max(2000).optional(),
        trigger_hours: z.number().int().min(1).max(24 * 365).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const { error } = await context.supabase
      .from("auto_campaigns")
      .update(rest)
      .eq("id", id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markContactPurchase = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) => z.object({ contactId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("contacts")
      .update({ last_purchase_at: new Date().toISOString() })
      .eq("id", data.contactId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });