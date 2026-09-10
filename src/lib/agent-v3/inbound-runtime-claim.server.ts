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

type RuntimeClaimInput = {
  messageId: string;
  conversationId: string;
  holder: string;
};

/**
 * Takes a job that is already `processing_safe` under input.holder, acquires the
 * persistent conversation lock, then crosses the one-way boundary to
 * `processing`. This is shared by webhook claims and dispatcher claim transfers.
 *
 * enterAgentInboundRuntime verifies ambiguous RPC responses against durable DB
 * state. Therefore a returned true is confirmed processing ownership, a returned
 * false is confirmed safe non-entry, and only a thrown error remains uncertain.
 */
export async function enterClaimedAgentInboundForRuntime(
  supabaseAdmin: any,
  input: RuntimeClaimInput,
): Promise<Exclude<AgentInboundRuntimeClaimResult, { status: "job_busy" }>> {
  let conversationLocked = false;
  let transitionUncertain = false;

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

    let enteredRuntime: boolean;
    try {
      enteredRuntime = await enterAgentInboundRuntime(
        supabaseAdmin,
        input.messageId,
        input.holder,
      );
    } catch (error) {
      // The lower-level helper already attempted durable read-back. A throw here
      // means neither success nor safe non-entry could be established.
      transitionUncertain = true;
      throw error;
    }

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
    // Never unlock an ambiguous processing transition. A second runtime must not
    // enter until stale durable recovery can determine/quarantine the job.
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

    if (transitionUncertain) {
      console.error(
        "[AGENT-INBOUND-CLAIM] runtime transition remains uncertain after durable verification; preserving job and conversation lock for recovery",
      );
      throw error;
    }

    // Every failure that reaches here is still on the confirmed safe side of the
    // runtime boundary. Requeue only under the current holder; ownership changes
    // are intentionally not overridden.
    const reason = error instanceof Error ? error.message : String(error);
    try {
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
    } catch (stateError) {
      console.error("[AGENT-INBOUND-CLAIM] failed to preserve durable safe failure state", stateError);
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
