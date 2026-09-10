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

export async function enterClaimedAgentInboundForRuntime(
  supabaseAdmin: any,
  input: RuntimeClaimInput,
): Promise<Exclude<AgentInboundRuntimeClaimResult, { status: "job_busy" }>> {
  let conversationLocked = false;
  let preserveConversationLock = false;

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
        throw new Error(`Agent inbound safe requeue rejected for message ${input.messageId}`);
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
      // enterAgentInboundRuntime already performs durable read-back. If it still
      // throws, we cannot prove which side of the side-effect boundary owns the
      // job, so preserve both durable job state and the conversation lock.
      preserveConversationLock = true;
      throw error;
    }

    if (!enteredRuntime) {
      // We are still durably on the safe side. Requeue the job BEFORE unlocking
      // the conversation. If requeue itself becomes uncertain, preserve the lock
      // as well: stale recovery can resolve processing_safe without allowing a
      // concurrent worker to enter the conversation in the meantime.
      let requeued: boolean;
      try {
        requeued = await releaseAgentInboundJob(
          supabaseAdmin,
          input.messageId,
          input.holder,
          "runtime ownership transition rejected",
        );
      } catch (error) {
        preserveConversationLock = true;
        throw error;
      }
      if (!requeued) {
        throw new Error(
          `Agent inbound runtime-transition requeue rejected for message ${input.messageId}`,
        );
      }

      const released = await releaseAgentConversationLock(
        supabaseAdmin,
        input.conversationId,
        input.holder,
      );
      if (!released) {
        throw new Error(
          `Agent conversation lock ownership changed for message ${input.messageId}`,
        );
      }
      conversationLocked = false;
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
    if (preserveConversationLock) {
      console.error(
        "[AGENT-INBOUND-CLAIM] durable safe/runtime transition remains uncertain; preserving job and conversation lock for recovery",
      );
      throw error;
    }

    // On a confirmed safe-side failure, requeue while the conversation lock is
    // still held. Unlocking first creates a window where another worker can enter
    // while this job continues to advertise processing_safe ownership.
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
      // A lost requeue response is ownership uncertainty. Keep the conversation
      // lock instead of opening the door to a second worker.
      console.error("[AGENT-INBOUND-CLAIM] safe requeue remains uncertain; preserving conversation lock", stateError);
      throw error;
    }

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
    throw error;
  }
}

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
