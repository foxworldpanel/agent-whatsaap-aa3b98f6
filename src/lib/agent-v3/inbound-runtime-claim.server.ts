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

type RuntimeClaimInput = {
  messageId: string;
  conversationId: string;
  holder: string;
};

/**
 * Takes a job that is already `processing_safe` under input.holder, acquires the
 * persistent conversation lock, then crosses the one-way boundary to
 * `processing`. This is shared by webhook claims and dispatcher claim transfers.
 */
export async function enterClaimedAgentInboundForRuntime(
  supabaseAdmin: any,
  input: RuntimeClaimInput,
): Promise<Exclude<AgentInboundRuntimeClaimResult, { status: "job_busy" }>> {
  let conversationLocked = false;
  let enteredRuntime = false;
  let runtimeTransitionAttempted = false;
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

    runtimeTransitionAttempted = true;
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
    const reason = error instanceof Error ? error.message : String(error);

    // If the RPC call that crosses processing_safe -> processing threw, its
    // database result is unknown: PostgreSQL may have committed the transition
    // while the client lost the response. Do NOT release the conversation lock
    // in that case. Keeping it blocks a second runtime until durable stale-state
    // recovery can inspect/quarantine the job.
    const transitionUncertain = runtimeTransitionAttempted && !enteredRuntime;

    if (conversationLocked && !transitionUncertain) {
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
      } else if (!transitionUncertain) {
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
      } else {
        console.error(
          "[AGENT-INBOUND-CLAIM] runtime transition result uncertain; preserving job and conversation lock for durable recovery",
        );
      }
    } catch (stateError) {
      console.error("[AGENT-INBOUND-CLAIM] failed to preserve durable failure state", stateError);
    }
    throw error;
  }
}

/**
 * Immediate-path helper. It first claims a pending job and then delegates all
 * processing_safe ownership semantics to enterClaimedAgentInboundForRuntime.
 */
export async function claimAgentInboundForRuntime(
  supabaseAdmin: any,
  input: RuntimeClaimInput,
): Promise<AgentInboundRuntimeClaimResult> {
  const claimed = await claimAgentInboundJob(
    supabaseAdmin,
    input.messageId,
    input.holder,
  );
  if (!claimed) return { status: "job_busy" };
  return enterClaimedAgentInboundForRuntime(supabaseAdmin, input);
}
