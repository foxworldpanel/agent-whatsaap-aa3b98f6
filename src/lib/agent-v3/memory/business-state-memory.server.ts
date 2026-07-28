import type { BusinessDecisionV3 } from "../brain/business-state.server";

export async function persistBusinessStateV3(params: {
  supabaseAdmin: any;
  userId: string;
  workspaceId: string;
  conversationId: string;
  decision: BusinessDecisionV3;
  summary?: string | null;
}) {
  const { error } = await params.supabaseAdmin
    .from("conversation_business_state_v3")
    .upsert(
      {
        user_id: params.userId,
        workspace_id: params.workspaceId,
        conversation_id: params.conversationId,
        state: params.decision.state,
        risk_level: params.decision.risk,
        reason: params.decision.reason,
        next_action: params.decision.nextAction,
        summary: params.summary ?? null,
        objective: params.decision.objective ?? null,
        purchase_score: params.decision.purchaseScore ?? null,
        confidence_score: params.decision.confidenceScore ?? null,
        urgency_score: params.decision.urgencyScore ?? null,
        waiting_customer: params.decision.waitingCustomer ?? false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,conversation_id" },
    );

  if (error) {
    // A migration pode ainda não ter sido aplicada em um deploy recém-subido.
    // Não derrube o atendimento por telemetria/estado persistente.
    console.warn("[BUSINESS-STATE-V3] Não foi possível persistir estado:", error.message || error);
  }
}

export async function loadBusinessStateV3(params: {
  supabaseAdmin: any;
  workspaceId: string;
  conversationIds: string[];
}): Promise<Map<string, any>> {
  const result = new Map<string, any>();
  if (params.conversationIds.length === 0) return result;

  for (let i = 0; i < params.conversationIds.length; i += 200) {
    const ids = params.conversationIds.slice(i, i + 200);
    const { data, error } = await params.supabaseAdmin
      .from("conversation_business_state_v3")
      .select("conversation_id, state, risk_level, reason, next_action, summary, objective, purchase_score, confidence_score, urgency_score, waiting_customer, updated_at")
      .eq("workspace_id", params.workspaceId)
      .in("conversation_id", ids);

    if (error) {
      console.warn("[BUSINESS-STATE-V3] Tabela indisponível:", error.message || error);
      return result;
    }

    for (const row of data || []) result.set(row.conversation_id, row);
  }

  return result;
}
