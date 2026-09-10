import {
  claimAgentInboundJob,
  enterAgentInboundRuntime,
  releaseAgentInboundJob,
  reviewAgentInboundJob,
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
  let enteredRuntime = false;
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

    enteredRuntime = await enterAgentInboundRuntime(
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
        const released = await releaseAgentConversationLock(
          supabaseAdmin,
          input.conversationId,
          input.holder,
        );
        if (!released) {
          console.error(
            "[AGENT-INBOUND-CLAIM] conversation lock ownership changed before failure release",
          );
        }
      } catch (releaseError) {
        console.error("[AGENT-INBOUND-CLAIM] failed to release conversation lock", releaseError);
      }
    }

    const reason = error instanceof Error ? error.message : String(error);

    // Once the RPC has confirmed `processing`, a later failure is uncertain:
    // runtime ownership existed and callers must never make that job replayable
    // again. Route it to review instead. Before that boundary, safe requeue is
    // allowed because no Agent V3 runtime side effect could have started.
    try {
      if (enteredRuntime) {
        const reviewed = await reviewAgentInboundJob(
          supabaseAdmin,
          input.messageId,
          input.holder,
          `runtime ownership claim failed after processing transition: ${reason}`,
        );
        if (!reviewed) {
          console.error(
            "[AGENT-INBOUND-CLAIM] runtime-stage review rejected because ownership changed",
          );
        }
      } else {
        const requeued = await releaseAgentInboundJob(
          supabaseAdmin,
          input.messageId,
          input.holder,
          reason,
        );
        if (!requeued) {
          console.error(
            "[AGENT-INBOUND-CLAIM] safe-stage requeue rejected because ownership changed",
          );
        }
      }
    } catch (stateError) {
      console.error("[AGENT-INBOUND-CLAIM] failed to preserve durable failure state", stateError);
    }
    throw error;
  }
}
