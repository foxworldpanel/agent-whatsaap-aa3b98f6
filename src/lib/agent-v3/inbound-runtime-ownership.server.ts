import {
  completeAgentInboundJob,
  reviewAgentInboundJob,
} from "@/lib/agent-v3/inbound-jobs.server";
import { releaseAgentConversationLock } from "@/lib/agent-v3/conversation-lock.server";

export type AgentInboundRuntimeOwnership = {
  messageId: string;
  conversationId: string;
  holder: string;
};

export type AgentInboundRuntimeOutcome =
  | { ok: true }
  | { ok: false; error: unknown };

function runtimeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Finalizes durable runtime ownership while the persistent conversation lock is
 * still held. This is shared by webhook and dispatcher so completion/review and
 * unlock ordering cannot drift between the fast path and recovery path.
 *
 * Once a job has entered `processing`, failures are never blindly requeued:
 * runtime may already have produced an external side effect, so uncertainty is
 * routed to `needs_review`.
 */
export async function finalizeAgentInboundRuntimeOwnership(
  supabaseAdmin: any,
  ownership: AgentInboundRuntimeOwnership,
  outcome: AgentInboundRuntimeOutcome,
): Promise<void> {
  try {
    if (outcome.ok) {
      await completeAgentInboundJob(
        supabaseAdmin,
        ownership.messageId,
        ownership.holder,
      );
    } else {
      const reviewed = await reviewAgentInboundJob(
        supabaseAdmin,
        ownership.messageId,
        ownership.holder,
        runtimeErrorMessage(outcome.error),
      );
      if (!reviewed) {
        throw new Error(
          `Agent inbound job review transition rejected for message ${ownership.messageId}`,
        );
      }
    }
  } catch (error) {
    // Do not unlock when the durable terminal transition is unknown. If the DB
    // accepted the transition but the client lost the response, recovery can
    // inspect the terminal job later. If it did not accept it, the processing
    // row plus generation lock still prevent a second concurrent runtime. A
    // stale processing job is quarantined to needs_review rather than replayed.
    throw error;
  }

  // Unlock only after a terminal durable state is confirmed. This ordering is a
  // core Stage B invariant: another inbound may enter this conversation only
  // after the current runtime is known to be processed or needs_review.
  const released = await releaseAgentConversationLock(
    supabaseAdmin,
    ownership.conversationId,
    ownership.holder,
  );
  if (!released) {
    throw new Error(
      `Agent conversation lock release rejected for message ${ownership.messageId}`,
    );
  }
}
