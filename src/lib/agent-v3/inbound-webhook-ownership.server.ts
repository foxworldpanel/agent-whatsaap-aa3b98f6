import { ensureAgentInboundJob,type AgentInboundKind,type EnsureAgentInboundJobResult } from "@/lib/agent-v3/inbound-jobs.server";
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

function durableInput(input:WebhookInboundOwnershipInput){
 return {
  messageId:input.messageId,conversationId:input.conversationId,workspaceId:input.workspaceId,
  sendTarget:input.sendTarget,inputText:input.inputText,inputKind:input.inputKind,
  inputMime:input.inputMime??undefined,deferredFunnel:input.deferredFunnel,
 };
}

/**
 * Stage B durability boundary for webhook messages that cannot yet be attached
 * to a semantic Customer Turn (for example while a Welcome Funnel owns or
 * quarantines the conversation). The job remains pending and the bounded
 * attachment worker can attach it after the conversation barrier becomes clear.
 */
export async function persistWebhookAgentInboundJob(
 supabaseAdmin:any,input:WebhookInboundOwnershipInput,
):Promise<EnsureAgentInboundJobResult>{
 return ensureAgentInboundJob(supabaseAdmin,durableInput(input));
}

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
  const queued = await enqueueAgentInboundIntoCustomerTurn(supabaseAdmin,durableInput(input));
  return { status: "queued_turn", ...queued };
}
