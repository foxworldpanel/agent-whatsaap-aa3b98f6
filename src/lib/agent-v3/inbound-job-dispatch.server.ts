import {
  claimNextAgentInboundJob,
  recoverStaleAgentInboundJobs,
  releaseAgentInboundJob,
  transferAgentInboundJobClaim,
  type AgentInboundJob,
} from "@/lib/agent-v3/inbound-jobs.server";
import { loadAgentInboundResumeContext } from "@/lib/agent-v3/inbound-job-context.server";
import {
  runtimeInputFromResumeContext,
  type AgentV3RuntimeExecutor,
} from "@/lib/agent-v3/inbound-runtime-contract.server";
import {
  finalizeAgentInboundRuntimeOwnership,
  type AgentInboundRuntimeOutcome,
  type AgentInboundRuntimeOwnership,
} from "@/lib/agent-v3/inbound-runtime-ownership.server";
import { enterClaimedAgentInboundForRuntime } from "@/lib/agent-v3/inbound-runtime-claim.server";

export type ClaimedAgentInbound = {
  job: AgentInboundJob;
  holder: string;
  ownership: AgentInboundRuntimeOwnership;
  context: Awaited<ReturnType<typeof loadAgentInboundResumeContext>>;
};

/**
 * Claims one durable pending job and moves it to the exact boundary immediately
 * before Agent V3 runtime side effects. It never replays webhook gates.
 *
 * Resume context is validated while the job is still processing_safe. Only after
 * the durable snapshot and tenant/provider identities are proven coherent do we
 * cross into processing, where replay becomes unsafe.
 */
export async function claimOneAgentInboundForRuntime(
  supabaseAdmin: any,
  workerId: string,
): Promise<ClaimedAgentInbound | null> {
  const queueHolder = `dispatcher-select:${workerId}:${Date.now()}`;
  const job = await claimNextAgentInboundJob(supabaseAdmin, queueHolder);
  if (!job) return null;

  // Context reconstruction has no Agent V3 runtime side effects. Validate it at
  // the safe phase so missing/corrupt dependencies do not get mislabeled as an
  // uncertain runtime execution. A failure is requeued under the guarded holder;
  // max-attempt stale recovery remains the backstop for repeated bad snapshots.
  let context: Awaited<ReturnType<typeof loadAgentInboundResumeContext>>;
  try {
    context = await loadAgentInboundResumeContext(supabaseAdmin, job);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const requeued = await releaseAgentInboundJob(
      supabaseAdmin,
      job.message_id,
      queueHolder,
      `resume context validation failed: ${reason}`,
    );
    if (!requeued) {
      console.error(
        "[AGENT-INBOUND-DISPATCH] resume-context failure could not be safely requeued because ownership changed",
      );
    }
    throw error;
  }

  const holder = `dispatcher:${workerId}:${Date.now()}`;
  let transferred = false;
  try {
    transferred = await transferAgentInboundJobClaim(
      supabaseAdmin,
      job.message_id,
      queueHolder,
      holder,
    );
  } catch (error) {
    // The transfer RPC can fail before the database accepts it, or the client can
    // lose the response after the database accepted it. First try the old holder;
    // then the new holder. Both releases are status/holder guarded, so at most one
    // can make this still-safe job pending again.
    const reason = error instanceof Error ? error.message : String(error);
    let recovered = false;
    try {
      recovered = await releaseAgentInboundJob(
        supabaseAdmin,
        job.message_id,
        queueHolder,
        `dispatcher claim transfer failed: ${reason}`,
      );
      if (!recovered) {
        recovered = await releaseAgentInboundJob(
          supabaseAdmin,
          job.message_id,
          holder,
          `dispatcher claim transfer result uncertain: ${reason}`,
        );
      }
    } catch (recoveryError) {
      console.error("[AGENT-INBOUND-DISPATCH] failed to recover transfer error", recoveryError);
    }
    if (!recovered) {
      console.error(
        "[AGENT-INBOUND-DISPATCH] transfer error could not be immediately requeued; stale processing_safe recovery remains authoritative",
      );
    }
    throw error;
  }

  if (!transferred) {
    // A false result means the row no longer belongs to queueHolder. Do not
    // mutate another holder's state; stale recovery handles abandoned safe claims.
    throw new Error("dispatcher queue ownership changed before atomic runtime transfer");
  }

  const claim = await enterClaimedAgentInboundForRuntime(supabaseAdmin, {
    messageId: job.message_id,
    conversationId: job.conversation_id,
    holder,
  });

  if (claim.status !== "claimed") {
    // conversation_busy/ownership_changed are already durably handled by the
    // shared helper. This worker has nothing safe to execute.
    return null;
  }

  return { job, holder, ownership: claim.ownership, context };
}

export async function finishClaimedAgentInbound(
  supabaseAdmin: any,
  claim: ClaimedAgentInbound,
  outcome: AgentInboundRuntimeOutcome,
): Promise<void> {
  await finalizeAgentInboundRuntimeOwnership(
    supabaseAdmin,
    claim.ownership,
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
