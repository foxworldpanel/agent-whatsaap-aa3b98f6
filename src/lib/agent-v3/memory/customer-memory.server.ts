export type CustomerLifecycle =
  | "novo_lead"
  | "interessado"
  | "negociacao"
  | "pronto_para_comprar"
  | "cliente"
  | "cliente_recorrente";

export type RepurchasePotential = "baixo" | "medio" | "alto";

export type CustomerCommercialMemory = {
  lifecycle: CustomerLifecycle;
  convertedAt: string | null;
  purchaseCount: number;
  preferredPlatform: string | null;
  preferredProduct: string | null;
  lastPurchaseSummary: string | null;
  nextOpportunity: string | null;
  repurchasePotential: RepurchasePotential;
  updatedAt: string | null;
};

export const DEFAULT_CUSTOMER_MEMORY: CustomerCommercialMemory = {
  lifecycle: "novo_lead",
  convertedAt: null,
  purchaseCount: 0,
  preferredPlatform: null,
  preferredProduct: null,
  lastPurchaseSummary: null,
  nextOpportunity: null,
  repurchasePotential: "baixo",
  updatedAt: null,
};

function normalized(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function isConfirmedPurchaseMessage(value: string): boolean {
  const text = normalized(value);
  if (!text) return false;

  return [
    /\bja (?:fiz|comprei|paguei|consegui)\b/,
    /\bfiz (?:o|os|meu|meus) pedido/,
    /\bpedido[s]? (?:feito|feitos|realizado|realizados)\b/,
    /\bagora (?:e|eh) so aguardar\b/,
    /\bagora vou aguardar\b/,
    /\bja criei minha conta\b.*\b(?:fiz|pedido|saldo)\b/,
    /\bbotei (?:de|em) (?:uma|duas|dois|\d+) music/,
    /\bficou r?\$?\s*\d+[,.]?\d*\b.*\bsaldo\b/,
  ].some((pattern) => pattern.test(text));
}

export function extractNextOpportunity(value: string): string | null {
  const text = String(value || "").trim();
  if (!text) return null;

  const patterns = [
    /\b(?:m[eê]s que vem|pr[oó]ximo m[eê]s)\b[^.!?]{0,100}/i,
    /\b(?:em|para|pra)\s+(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b[^.!?]{0,100}/i,
    /\b(?:vou|pretendo)\s+lan[cç]ar\b[^.!?]{0,120}/i,
    /\b(?:novas?|outras?)\s+m[uú]sicas?\b[^.!?]{0,100}/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[0]) return match[0].trim().slice(0, 180);
  }
  return null;
}

export async function loadCustomerCommercialMemory(params: {
  supabaseAdmin: any;
  workspaceId: string;
  contactId: string;
  contactTemperature?: string | null;
  contactProfile?: string | null;
}): Promise<CustomerCommercialMemory> {
  const fallbackConverted =
    params.contactTemperature === "cliente" || params.contactProfile === "ativo";

  try {
    const { data, error } = await params.supabaseAdmin
      .from("customer_commercial_memory")
      .select(
        "lifecycle, converted_at, purchase_count, preferred_platform, preferred_product, last_purchase_summary, next_opportunity, repurchase_potential, updated_at",
      )
      .eq("workspace_id", params.workspaceId)
      .eq("contact_id", params.contactId)
      .maybeSingle();

    if (error) {
      console.warn("[CUSTOMER-MEMORY] tabela indisponível; usando fallback do contato:", error.message || error);
      return {
        ...DEFAULT_CUSTOMER_MEMORY,
        lifecycle: fallbackConverted ? "cliente" : "novo_lead",
        repurchasePotential: fallbackConverted ? "alto" : "baixo",
      };
    }

    if (!data) {
      return {
        ...DEFAULT_CUSTOMER_MEMORY,
        lifecycle: fallbackConverted ? "cliente" : "novo_lead",
        repurchasePotential: fallbackConverted ? "alto" : "baixo",
      };
    }

    return {
      lifecycle: (data.lifecycle || (fallbackConverted ? "cliente" : "novo_lead")) as CustomerLifecycle,
      convertedAt: data.converted_at || null,
      purchaseCount: Number(data.purchase_count || 0),
      preferredPlatform: data.preferred_platform || null,
      preferredProduct: data.preferred_product || null,
      lastPurchaseSummary: data.last_purchase_summary || null,
      nextOpportunity: data.next_opportunity || null,
      repurchasePotential: (data.repurchase_potential || (fallbackConverted ? "alto" : "baixo")) as RepurchasePotential,
      updatedAt: data.updated_at || null,
    };
  } catch (error) {
    console.warn("[CUSTOMER-MEMORY] leitura falhou; usando fallback:", error);
    return {
      ...DEFAULT_CUSTOMER_MEMORY,
      lifecycle: fallbackConverted ? "cliente" : "novo_lead",
      repurchasePotential: fallbackConverted ? "alto" : "baixo",
    };
  }
}

export async function persistCustomerCommercialMemory(params: {
  supabaseAdmin: any;
  workspaceId: string;
  userId: string;
  contactId: string;
  current: CustomerCommercialMemory;
  customerMessage: string;
  platform?: string | null;
  product?: string | null;
  intent?: string | null;
  stage?: string | null;
  purchaseProbability?: number;
}): Promise<CustomerCommercialMemory> {
  const now = new Date().toISOString();
  const confirmedPurchase = isConfirmedPurchaseMessage(params.customerMessage);
  const nextOpportunity =
    extractNextOpportunity(params.customerMessage) || params.current.nextOpportunity;

  let lifecycle = params.current.lifecycle;
  if (confirmedPurchase) {
    lifecycle =
      params.current.lifecycle === "cliente" || params.current.lifecycle === "cliente_recorrente"
        ? "cliente_recorrente"
        : "cliente";
  } else if (lifecycle !== "cliente" && lifecycle !== "cliente_recorrente") {
    if (params.intent === "pagamento" || Number(params.purchaseProbability || 0) >= 88) {
      lifecycle = "pronto_para_comprar";
    } else if (
      params.stage === "Fechamento" ||
      params.stage === "fechamento" ||
      Number(params.purchaseProbability || 0) >= 70
    ) {
      lifecycle = "negociacao";
    } else if (Number(params.purchaseProbability || 0) >= 40) {
      lifecycle = "interessado";
    }
  }

  const converted = lifecycle === "cliente" || lifecycle === "cliente_recorrente";
  const next: CustomerCommercialMemory = {
    lifecycle,
    convertedAt: confirmedPurchase
      ? params.current.convertedAt || now
      : params.current.convertedAt,
    purchaseCount: confirmedPurchase
      ? Math.max(1, params.current.purchaseCount + 1)
      : params.current.purchaseCount,
    preferredPlatform: params.platform || params.current.preferredPlatform,
    preferredProduct: params.product || params.current.preferredProduct,
    lastPurchaseSummary: confirmedPurchase
      ? params.customerMessage.trim().slice(0, 300)
      : params.current.lastPurchaseSummary,
    nextOpportunity,
    repurchasePotential: converted
      ? nextOpportunity
        ? "alto"
        : params.current.purchaseCount > 0
          ? "alto"
          : "medio"
      : Number(params.purchaseProbability || 0) >= 70
        ? "alto"
        : Number(params.purchaseProbability || 0) >= 40
          ? "medio"
          : params.current.repurchasePotential,
    updatedAt: now,
  };

  // Fallback persistente em colunas já existentes. Mesmo que a migration da
  // memória ainda não esteja aplicada, um comprador não volta a lead frio.
  if (confirmedPurchase) {
    const { error: contactError } = await params.supabaseAdmin
      .from("contacts")
      .update({
        perfil: "ativo",
        temperatura: "cliente",
        last_interaction_at: now,
      })
      .eq("id", params.contactId)
      .eq("workspace_id", params.workspaceId);

    if (contactError) {
      console.warn("[CUSTOMER-MEMORY] Falha ao marcar contato convertido:", contactError);
    }
  }

  try {
    const { error } = await params.supabaseAdmin
      .from("customer_commercial_memory")
      .upsert(
        {
          workspace_id: params.workspaceId,
          user_id: params.userId,
          contact_id: params.contactId,
          lifecycle: next.lifecycle,
          converted_at: next.convertedAt,
          purchase_count: next.purchaseCount,
          preferred_platform: next.preferredPlatform,
          preferred_product: next.preferredProduct,
          last_purchase_summary: next.lastPurchaseSummary,
          next_opportunity: next.nextOpportunity,
          repurchase_potential: next.repurchasePotential,
          updated_at: now,
        },
        { onConflict: "workspace_id,contact_id" },
      );

    if (error) {
      console.warn("[CUSTOMER-MEMORY] Falha ao persistir memória detalhada:", error.message || error);
    }
  } catch (error) {
    console.warn("[CUSTOMER-MEMORY] Persistência detalhada indisponível:", error);
  }

  return next;
}

export function customerMemoryPromptContext(memory: CustomerCommercialMemory): string {
  const converted = memory.lifecycle === "cliente" || memory.lifecycle === "cliente_recorrente";
  return [
    "MEMÓRIA COMERCIAL PERSISTENTE DO CONTATO:",
    `- Estado: ${memory.lifecycle}`,
    `- Já é cliente: ${converted ? "sim" : "não"}`,
    `- Compras registradas: ${memory.purchaseCount}`,
    `- Plataforma preferida: ${memory.preferredPlatform || "não definida"}`,
    `- Serviço preferido: ${memory.preferredProduct || "não definido"}`,
    `- Potencial de recompra: ${memory.repurchasePotential}`,
    `- Próxima oportunidade: ${memory.nextOpportunity || "não registrada"}`,
    memory.lastPurchaseSummary
      ? `- Última confirmação de compra: ${memory.lastPurchaseSummary}`
      : "- Última confirmação de compra: não registrada",
    converted
      ? "- REGRA: trate esta pessoa como cliente existente/pós-venda. Não reinicie qualificação de lead nem funil de boas-vindas."
      : "",
  ].filter(Boolean).join("\n");
}
