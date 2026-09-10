import {
  AGENT_INBOUND_MAX_SAFE_ATTEMPTS,
  claimNextAgentInboundJob,
  recoverStaleAgentInboundJobs,
  releaseAgentInboundJob,
  reviewSafeAgentInboundJob,
  transferAgentInboundJobClaim,
  type AgentInboundJob,
} from "@/lib/agent-v3/inbound-jobs.server";
import {
  isAgentInboundResumeIntegrityError,
  loadAgentInboundResumeContext,
} from "@/lib/agent-v3/inbound-job-context.server";
import { runtimeInputFromResumeContext, type AgentV3RuntimeExecutor } from "@/lib/agent-v3/inbound-runtime-contract.server";
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

export async function claimOneAgentInboundForRuntime(supabaseAdmin: any, workerId: string): Promise<ClaimedAgentInbound | null> {
  const queueHolder = `dispatcher-select:${workerId}:${Date.now()}`;
  const job = await claimNextAgentInboundJob(supabaseAdmin, queueHolder);
  if (!job) return null;

  let context: Awaited<ReturnType<typeof loadAgentInboundResumeContext>>;
  try {
    context = await loadAgentInboundResumeContext(supabaseAdmin, job);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const failure = `resume context validation failed: ${reason}`;
    const deterministicCorruption = isAgentInboundResumeIntegrityError(error);

    // Identity/configuration corruption cannot heal by retrying the same durable
    // snapshot. Quarantine it immediately while still processing_safe. Transport
    // and Supabase query failures remain retryable, but only up to the shared cap.
    if (deterministicCorruption || job.attempt_count >= AGENT_INBOUND_MAX_SAFE_ATTEMPTS) {
      const reviewed = await reviewSafeAgentInboundJob(supabaseAdmin, job.message_id, queueHolder, failure);
      if (!reviewed) {
        console.error("[AGENT-INBOUND-DISPATCH] safe quarantine rejected because ownership changed");
      }
    } else {
      const requeued = await releaseAgentInboundJob(supabaseAdmin, job.message_id, queueHolder, failure);
      if (!requeued) {
        console.error("[AGENT-INBOUND-DISPATCH] resume-context failure could not be safely requeued because ownership changed");
      }
    }
    throw error;
  }

  const holder = `dispatcher:${workerId}:${Date.now()}`;
  let transferred = false;
  try {
    transferred = await transferAgentInboundJobClaim(supabaseAdmin, job.message_id, queueHolder, holder);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    let recovered = false;
    try {
      recovered = await releaseAgentInboundJob(supabaseAdmin, job.message_id, queueHolder,
        `dispatcher claim transfer failed: ${reason}`);
      if (!recovered) {
        recovered = await releaseAgentInboundJob(supabaseAdmin, job.message_id, holder,
          `dispatcher claim transfer result uncertain: ${reason}`);
      }
    } catch (recoveryError) {
      console.error("[AGENT-INBOUND-DISPATCH] failed to recover transfer error", recoveryError);
    }
    if (!recovered) {
      console.error("[AGENT-INBOUND-DISPATCH] transfer error could not be immediately requeued; stale processing_safe recovery remains authoritative");
    }
    throw error;
  }

  if (!transferred) throw new Error("dispatcher queue ownership changed before atomic runtime transfer");

  const claim = await enterClaimedAgentInboundForRuntime(supabaseAdmin, {
    messageId: job.message_id, conversationId: job.conversation_id, holder,
  });
  if (claim.status !== "claimed") return null;
  return { job, holder, ownership: claim.ownership, context };
}

export async function finishClaimedAgentInbound(supabaseAdmin: any, claim: ClaimedAgentInbound,
  outcome: AgentInboundRuntimeOutcome): Promise<void> {
  await finalizeAgentInboundRuntimeOwnership(supabaseAdmin, claim.ownership, outcome);
}

export async function dispatchOneAgentInbound(supabaseAdmin: any, workerId: string,
  executeRuntime: AgentV3RuntimeExecutor): Promise<"idle" | "processed" | "needs_review"> {
  const claim = await claimOneAgentInboundForRuntime(supabaseAdmin, workerId);
  if (!claim) return "idle";

  let runtimeFailed = false;
  let runtimeError: unknown;
  try {
    await executeRuntime(supabaseAdmin, runtimeInputFromResumeContext(claim.context));
  } catch (error) {
    runtimeFailed = true;
    runtimeError = error;
  }

  if (!runtimeFailed) {
    await finishClaimedAgentInbound(supabaseAdmin, claim, { ok: true });
    return "processed";
  }
  await finishClaimedAgentInbound(supabaseAdmin, claim, { ok: false, error: runtimeError });
  return "needs_review";
}

export async function recoverAgentInboundDispatcherClaims(supabaseAdmin: any, staleMs = 5 * 60 * 1000,
  maxAttempts = AGENT_INBOUND_MAX_SAFE_ATTEMPTS): Promise<{ requeued: number; review: number }> {
  const staleBefore = new Date(Date.now() - staleMs).toISOString();
  return recoverStaleAgentInboundJobs(supabaseAdmin, staleBefore, maxAttempts);
}
