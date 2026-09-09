import {
  claimAgentInboundJob,
  enterAgentInboundRuntime,
  releaseAgentInboundJob,
} from "@/lib/agent-v3/inbound-jobs.server";
import {
  acquireAgentConversationLock,
  releaseAgentConversationLock,
} from "@/lib/agent-v3/conversation-lock.server";
import type { AgentInboundRuntimeOwnership } from "@/lib/agent-v3/inbound-runtime-ownership.server";

export type AgentInboundRuntimeClaimResult =
  | { status: "claimed"; ownership: AgentInboundRuntimeOwnership }
  | { status: "job_busy" }
  | { status: "conversation_busy" }
  | { status: "ownership_changed" };

/**
 * Shared pre-runtime ownership transition for both the immediate webhook and
 * durable recovery paths.
 *
 * The job remains safely replayable while it is `processing_safe`. Only after
 * the persistent conversation lock is held do we transition to `processing`,
 * where failures must be treated as runtime uncertainty rather than requeued.
 */
export async function claimAgentInboundForRuntime(
  supabaseAdmin: any,
  input: {
    messageId: string;
    conversationId: string;
    holder: string;
  },
): Promise<AgentInboundRuntimeClaimResult> {
  const claimed = await claimAgentInboundJob(
    supabaseAdmin,
    input.messageId,
    input.holder,
  );
  if (!claimed) return { status: "job_busy" };

  let conversationLocked = false;
  try {
    conversationLocked = await acquireAgentConversationLock(
      supabaseAdmin,
      input.conversationId,
      input.holder,
    );

    if (!conversationLocked) {
      const requeued = await releaseAgentInboundJob(
        supabaseAdmin,
        input.messageId,
        input.holder,
        "conversation busy",
      );
      if (!requeued) {
        throw new Error(
          `Agent inbound safe requeue rejected for message ${input.messageId}`,
        );
      }
      return { status: "conversation_busy" };
    }

    const enteredRuntime = await enterAgentInboundRuntime(
      supabaseAdmin,
      input.messageId,
      input.holder,
    );
    if (!enteredRuntime) {
      const released = await releaseAgentConversationLock(
        supabaseAdmin,
        input.conversationId,
        input.holder,
      );
      conversationLocked = false;
      if (!released) {
        throw new Error(
          `Agent conversation lock ownership changed for message ${input.messageId}`,
        );
      }

      const requeued = await releaseAgentInboundJob(
        supabaseAdmin,
        input.messageId,
        input.holder,
        "runtime ownership transition rejected",
      );
      if (!requeued) {
        throw new Error(
          `Agent inbound runtime-transition requeue rejected for message ${input.messageId}`,
        );
      }
      return { status: "ownership_changed" };
    }

    return {
      status: "claimed",
      ownership: {
        messageId: input.messageId,
        conversationId: input.conversationId,
        holder: input.holder,
      },
    };
  } catch (error) {
    if (conversationLocked) {
      try {
        await releaseAgentConversationLock(
          supabaseAdmin,
          input.conversationId,
          input.holder,
        );
      } catch (releaseError) {
        console.error("[AGENT-INBOUND-CLAIM] failed to release conversation lock", releaseError);
      }
    }

    // At this helper's failure boundary the runtime transition has not returned
    // success, so only processing_safe ownership may be returned to pending.
    // releaseAgentInboundJob is status-guarded and will refuse processing jobs.
    try {
      await releaseAgentInboundJob(
        supabaseAdmin,
        input.messageId,
        input.holder,
        error instanceof Error ? error.message : String(error),
      );
    } catch (requeueError) {
      console.error("[AGENT-INBOUND-CLAIM] failed to restore safe job", requeueError);
    }
    throw error;
  }
}
