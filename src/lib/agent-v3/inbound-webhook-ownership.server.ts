import type { AgentInboundKind } from "@/lib/agent-v3/inbound-jobs.server";
import { enqueueAgentInboundIntoCustomerTurn } from "@/lib/agent-v3/customer-turn-ingress.server";

export type WebhookInboundOwnershipInput = {
  messageId: string;
  conversationId: string;
  workspaceId: string;
  sendTarget: string;
  inputText: string;
  inputKind: AgentInboundKind;
  inputMime?: string | null;
  deferredFunnel: boolean;
  holder: string;
};

export type WebhookInboundOwnershipResult = {
  status: "queued_turn";
  jobId: string;
  turnId: string;
  duplicate: boolean;
};

/**
 * Durable Stage C webhook boundary. Eligibility remains owned by the webhook,
 * but once an eligible inbound reaches this function it is persisted as a
 * Stage B job and attached to exactly one collecting Customer Turn. Runtime is
 * deliberately NOT entered here: the turn dispatcher owns the only semantic
 * execution after the natural-silence window.
 */
export async function beginWebhookAgentInboundRuntime(
  supabaseAdmin: any,
  input: WebhookInboundOwnershipInput,
): Promise<WebhookInboundOwnershipResult> {
  const queued = await enqueueAgentInboundIntoCustomerTurn(supabaseAdmin, {
    messageId: input.messageId,
    conversationId: input.conversationId,
    workspaceId: input.workspaceId,
    sendTarget: input.sendTarget,
    inputText: input.inputText,
    inputKind: input.inputKind,
    inputMime: input.inputMime ?? undefined,
    deferredFunnel: input.deferredFunnel,
  });
  return { status: "queued_turn", ...queued };
}
