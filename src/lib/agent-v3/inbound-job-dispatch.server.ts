import {
  claimNextAgentInboundJob,
  completeAgentInboundJob,
  enterAgentInboundRuntime,
  recoverStaleAgentInboundJobs,
  releaseAgentInboundJob,
  reviewAgentInboundJob,
  type AgentInboundJob,
} from "@/lib/agent-v3/inbound-jobs.server";
import { loadAgentInboundResumeContext } from "@/lib/agent-v3/inbound-job-context.server";
import {
  acquireAgentConversationLock,
  releaseAgentConversationLock,
} from "@/lib/agent-v3/conversation-lock.server";

export type ClaimedAgentInbound = {
  job: AgentInboundJob;
  holder: string;
  context: Awaited<ReturnType<typeof loadAgentInboundResumeContext>>;
};

/**
 * Claims one durable pending job and moves it to the exact boundary immediately
 * before Agent V3 runtime side effects. It never replays webhook gates.
 *
 * The caller MUST call finishClaimedAgentInbound after running the shared V3
 * runtime. Until the runtime extraction is wired, this function is intentionally
 * not exposed as an HTTP dispatcher: owning a job without executing it would be
 * worse than leaving it pending.
 */
export async function claimOneAgentInboundForRuntime(
  supabaseAdmin: any,
  workerId: string,
): Promise<ClaimedAgentInbound | null> {
  const holder = `dispatcher:${workerId}:${Date.now()}`;
  const job = await claimNextAgentInboundJob(supabaseAdmin, holder);
  if (!job) return null;

  let conversationLocked = false;
  let enteredRuntime = false;
  try {
    const context = await loadAgentInboundResumeContext(supabaseAdmin, job);
    conversationLocked = await acquireAgentConversationLock(
      supabaseAdmin,
      job.conversation_id,
      holder,
    );

    if (!conversationLocked) {
      await releaseAgentInboundJob(
        supabaseAdmin,
        job.message_id,
        holder,
        "conversation busy during dispatcher claim",
      );
      return null;
    }

    enteredRuntime = await enterAgentInboundRuntime(
      supabaseAdmin,
      job.message_id,
      holder,
    );
    if (!enteredRuntime) {
      await releaseAgentConversationLock(
        supabaseAdmin,
        job.conversation_id,
        holder,
      );
      conversationLocked = false;
      await releaseAgentInboundJob(
        supabaseAdmin,
        job.message_id,
        holder,
        "dispatcher runtime ownership transition rejected",
      );
      return null;
    }

    return { job, holder, context };
  } catch (error) {
    if (conversationLocked) {
      try {
        await releaseAgentConversationLock(
          supabaseAdmin,
          job.conversation_id,
          holder,
        );
      } catch (lockReleaseError) {
        console.error("[AGENT-INBOUND-DISPATCH] failed to release conversation lock", lockReleaseError);
      }
    }

    const reason = error instanceof Error ? error.message : String(error);
    try {
      if (!enteredRuntime) {
        const requeued = await releaseAgentInboundJob(
          supabaseAdmin,
          job.message_id,
          holder,
          reason,
        );
        if (!requeued) {
          throw new Error("safe-stage requeue rejected because durable ownership changed");
        }
      } else {
        const reviewed = await reviewAgentInboundJob(
          supabaseAdmin,
          job.message_id,
          holder,
          `dispatcher preparation failed after runtime transition: ${reason}`,
        );
        if (!reviewed) {
          throw new Error("runtime-stage review rejected because durable ownership changed");
        }
      }
    } catch (stateError) {
      console.error("[AGENT-INBOUND-DISPATCH] failed to finalize preparation state", stateError);
    }
    throw error;
  }
}

export async function finishClaimedAgentInbound(
  supabaseAdmin: any,
  claim: ClaimedAgentInbound,
  outcome: { ok: true } | { ok: false; error: unknown },
): Promise<void> {
  try {
    if (outcome.ok) {
      // Completion is intentionally committed while the conversation lock is
      // still held, matching the webhook invariant.
      await completeAgentInboundJob(
        supabaseAdmin,
        claim.job.message_id,
        claim.holder,
      );
    } else {
      const reviewed = await reviewAgentInboundJob(
        supabaseAdmin,
        claim.job.message_id,
        claim.holder,
        outcome.error instanceof Error
          ? outcome.error.message
          : String(outcome.error),
      );
      if (!reviewed) {
        throw new Error(
          `Agent inbound job review transition rejected for message ${claim.job.message_id}`,
        );
      }
    }
  } finally {
    await releaseAgentConversationLock(
      supabaseAdmin,
      claim.job.conversation_id,
      claim.holder,
    );
  }
}

export async function recoverAgentInboundDispatcherClaims(
  supabaseAdmin: any,
  staleMs = 5 * 60 * 1000,
  maxAttempts = 5,
): Promise<{ requeued: number; review: number }> {
  const staleBefore = new Date(Date.now() - staleMs).toISOString();
  return recoverStaleAgentInboundJobs(supabaseAdmin, staleBefore, maxAttempts);
}
