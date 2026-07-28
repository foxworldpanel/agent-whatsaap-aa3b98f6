export type ContactTemperatureV3 =
  | "frio"
  | "morno"
  | "quente"
  | "cliente"
  | "bloqueado";

const rank: Record<"frio" | "morno" | "quente", number> = {
  frio: 0,
  morno: 1,
  quente: 2,
};

export function derivePersistentContactTemperatureV3(params: {
  current?: string | null;
  lifecycle?: string | null;
  purchaseCount?: number | null;
  businessState?: string | null;
  intelligenceTemperature?: string | null;
  purchaseProbability?: number | null;
  hasPlatform?: boolean;
  hasProduct?: boolean;
}): ContactTemperatureV3 {
  const current = String(params.current || "frio").toLowerCase();

  // Estados manuais/definitivos nunca devem ser rebaixados automaticamente.
  if (current === "bloqueado") return "bloqueado";

  const converted =
    params.lifecycle === "cliente" ||
    params.lifecycle === "cliente_recorrente" ||
    Number(params.purchaseCount || 0) > 0 ||
    params.businessState === "pedido_realizado" ||
    params.businessState === "pos_venda";

  if (converted || current === "cliente") return "cliente";

  let candidate: "frio" | "morno" | "quente" = "frio";

  if (
    ["fechamento", "pagamento", "compra_bloqueada"].includes(
      String(params.businessState || ""),
    )
  ) {
    candidate = "quente";
  } else if (
    params.businessState === "orcamento" ||
    Number(params.purchaseProbability || 0) >= 40 ||
    params.intelligenceTemperature === "morno" ||
    (params.hasPlatform && params.hasProduct)
  ) {
    candidate = "morno";
  }

  if (
    Number(params.purchaseProbability || 0) >= 70 ||
    params.intelligenceTemperature === "quente"
  ) {
    candidate = "quente";
  }

  // O status CRM representa maturidade comercial persistente, não o humor de
  // uma mensagem isolada. Portanto, frio/morno/quente não regredem sozinhos.
  const currentSales =
    current === "quente" || current === "morno" || current === "frio"
      ? current
      : "frio";

  return rank[currentSales] > rank[candidate] ? currentSales : candidate;
}

export async function syncPersistentContactTemperatureV3(params: {
  supabaseAdmin: any;
  workspaceId: string;
  contactId: string;
  current?: string | null;
  lifecycle?: string | null;
  purchaseCount?: number | null;
  businessState?: string | null;
  intelligenceTemperature?: string | null;
  purchaseProbability?: number | null;
  hasPlatform?: boolean;
  hasProduct?: boolean;
}) {
  const next = derivePersistentContactTemperatureV3(params);
  if (next === params.current) return next;

  const now = new Date().toISOString();
  const { error } = await params.supabaseAdmin
    .from("contacts")
    .update({
      temperatura: next,
      temperatura_updated_at: now,
      last_interaction_at: now,
    })
    .eq("id", params.contactId)
    .eq("workspace_id", params.workspaceId);

  if (error) {
    console.warn("[CONTACT-TEMPERATURE-V3] Falha ao sincronizar temperatura:", error);
    return params.current || "frio";
  }

  console.log("[CONTACT-TEMPERATURE-V3] Temperatura atualizada", {
    contactId: params.contactId,
    from: params.current || "frio",
    to: next,
    businessState: params.businessState || null,
    purchaseProbability: params.purchaseProbability ?? null,
  });

  return next;
}
