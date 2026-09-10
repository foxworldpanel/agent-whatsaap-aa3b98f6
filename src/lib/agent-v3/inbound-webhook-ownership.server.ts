import {
  ensureAgentInboundJob,
  type AgentInboundKind,
} from "@/lib/agent-v3/inbound-jobs.server";
import {
  claimAgentInboundForRuntime,
  type AgentInboundRuntimeClaimResult,
} from "@/lib/agent-v3/inbound-runtime-claim.server";
import {
  finalizeAgentInboundRuntimeOwnership,
  type AgentInboundRuntimeOutcome,
  type AgentInboundRuntimeOwnership,
} from "@/lib/agent-v3/inbound-runtime-ownership.server";

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

export type WebhookInboundOwnershipResult =
  | { status: "claimed"; ownership: AgentInboundRuntimeOwnership }
  | Exclude<AgentInboundRuntimeClaimResult, { status: "claimed" }>;

/**
 * Single durable ownership boundary for the synchronous webhook fast path.
 *
 * Eligibility remains the webhook's responsibility: callers invoke this only
 * after fromMe/reaction/funnel/agent gates. Once invoked, however, job creation,
 * safe claim, conversation serialization and transition across the external
 * side-effect boundary are shared with the dispatcher implementation.
 */
export async function beginWebhookAgentInboundRuntime(
  supabaseAdmin: any,
  input: WebhookInboundOwnershipInput,
): Promise<WebhookInboundOwnershipResult> {
  await ensureAgentInboundJob(supabaseAdmin, {
    messageId: input.messageId,
    conversationId: input.conversationId,
    workspaceId: input.workspaceId,
    sendTarget: input.sendTarget,
    inputText: input.inputText,
    inputKind: input.inputKind,
    inputMime: input.inputMime ?? undefined,
    deferredFunnel: input.deferredFunnel,
  });

  return claimAgentInboundForRuntime(supabaseAdmin, {
    messageId: input.messageId,
    conversationId: input.conversationId,
    holder: input.holder,
  });
}

/**
 * Terminal webhook ownership path. The durable job is resolved before the
 * generation lock is released. Runtime failures are quarantined for review and
 * are never converted back to pending/replayed automatically.
 */
export async function finishWebhookAgentInboundRuntime(
  supabaseAdmin: any,
  ownership: AgentInboundRuntimeOwnership,
  outcome: AgentInboundRuntimeOutcome,
): Promise<void> {
  await finalizeAgentInboundRuntimeOwnership(supabaseAdmin, ownership, outcome);
}
