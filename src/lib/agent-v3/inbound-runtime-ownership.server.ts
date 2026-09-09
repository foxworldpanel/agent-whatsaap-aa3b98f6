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
  let finalizationError: unknown = null;

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
    finalizationError = error;
  }

  let releaseError: unknown = null;
  try {
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
  } catch (error) {
    releaseError = error;
  }

  // Preserve the state-transition failure as the primary error. Lock-release
  // failure is still surfaced when finalization itself succeeded.
  if (finalizationError) throw finalizationError;
  if (releaseError) throw releaseError;
}
