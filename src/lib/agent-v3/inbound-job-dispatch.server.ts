import {
  claimNextAgentInboundJob,
  enterAgentInboundRuntime,
  recoverStaleAgentInboundJobs,
  releaseAgentInboundJob,
  reviewAgentInboundJob,
  type AgentInboundJob,
} from "@/lib/agent-v3/inbound-jobs.server";
import { loadAgentInboundResumeContext } from "@/lib/agent-v3/inbound-job-context.server";
import {
  runtimeInputFromResumeContext,
  type AgentV3RuntimeExecutor,
} from "@/lib/agent-v3/inbound-runtime-contract.server";
import {
  acquireAgentConversationLock,
  releaseAgentConversationLock,
} from "@/lib/agent-v3/conversation-lock.server";
import {
  finalizeAgentInboundRuntimeOwnership,
  type AgentInboundRuntimeOutcome,
} from "@/lib/agent-v3/inbound-runtime-ownership.server";

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
      const requeued = await releaseAgentInboundJob(
        supabaseAdmin,
        job.message_id,
        holder,
        "conversation busy during dispatcher claim",
      );
      if (!requeued) {
        throw new Error("busy-stage requeue rejected because durable ownership changed");
      }
      return null;
    }

    enteredRuntime = await enterAgentInboundRuntime(
      supabaseAdmin,
      job.message_id,
      holder,
    );
    if (!enteredRuntime) {
      const lockReleased = await releaseAgentConversationLock(
        supabaseAdmin,
        job.conversation_id,
        holder,
      );
      conversationLocked = false;
      if (!lockReleased) {
        throw new Error("dispatcher lost conversation lock before runtime transition");
      }
      const requeued = await releaseAgentInboundJob(
        supabaseAdmin,
        job.message_id,
        holder,
        "dispatcher runtime ownership transition rejected",
      );
      if (!requeued) {
        throw new Error("runtime-transition requeue rejected because durable ownership changed");
      }
      return null;
    }

    return { job, holder, context };
  } catch (error) {
    if (conversationLocked) {
      try {
        const released = await releaseAgentConversationLock(
          supabaseAdmin,
          job.conversation_id,
          holder,
        );
        if (!released) {
          console.error("[AGENT-INBOUND-DISPATCH] conversation lock ownership changed before release");
        }
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
  outcome: AgentInboundRuntimeOutcome,
): Promise<void> {
  await finalizeAgentInboundRuntimeOwnership(
    supabaseAdmin,
    {
      messageId: claim.job.message_id,
      conversationId: claim.job.conversation_id,
      holder: claim.holder,
    },
    outcome,
  );
}

/**
 * Executes at most one pending durable inbound using the same Agent V3 runtime
 * contract as the immediate webhook path. This is the reusable dispatcher/drain
 * primitive; scheduling/HTTP exposure remains a separate concern.
 */
export async function dispatchOneAgentInbound(
  supabaseAdmin: any,
  workerId: string,
  executeRuntime: AgentV3RuntimeExecutor,
): Promise<"idle" | "processed" | "needs_review"> {
  const claim = await claimOneAgentInboundForRuntime(supabaseAdmin, workerId);
  if (!claim) return "idle";

  let runtimeFailed = false;
  let runtimeError: unknown;
  try {
    await executeRuntime(
      supabaseAdmin,
      runtimeInputFromResumeContext(claim.context),
    );
  } catch (error) {
    runtimeFailed = true;
    runtimeError = error;
  }

  // Finalization errors are ownership/integrity failures, not runtime failures.
  // Keep them outside the runtime catch so a job already marked processed is
  // never subjected to a second, contradictory needs_review transition.
  if (!runtimeFailed) {
    await finishClaimedAgentInbound(supabaseAdmin, claim, { ok: true });
    return "processed";
  }

  await finishClaimedAgentInbound(supabaseAdmin, claim, {
    ok: false,
    error: runtimeError,
  });
  return "needs_review";
}

export async function recoverAgentInboundDispatcherClaims(
  supabaseAdmin: any,
  staleMs = 5 * 60 * 1000,
  maxAttempts = 5,
): Promise<{ requeued: number; review: number }> {
  const staleBefore = new Date(Date.now() - staleMs).toISOString();
  return recoverStaleAgentInboundJobs(supabaseAdmin, staleBefore, maxAttempts);
}
