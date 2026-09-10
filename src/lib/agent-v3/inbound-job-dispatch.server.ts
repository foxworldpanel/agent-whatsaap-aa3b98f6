import {
  claimNextAgentInboundJob,
  recoverStaleAgentInboundJobs,
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
 * Queue selection and runtime ownership remain continuous: the dispatcher first
 * claims the row as processing_safe, atomically transfers that claim to the
 * runtime holder, then the shared helper acquires the conversation lock and
 * crosses processing_safe -> processing. The job is never exposed as pending in
 * the middle of that handoff.
 */
export async function claimOneAgentInboundForRuntime(
  supabaseAdmin: any,
  workerId: string,
): Promise<ClaimedAgentInbound | null> {
  const queueHolder = `dispatcher-select:${workerId}:${Date.now()}`;
  const job = await claimNextAgentInboundJob(supabaseAdmin, queueHolder);
  if (!job) return null;

  const holder = `dispatcher:${workerId}:${Date.now()}`;
  const transferred = await transferAgentInboundJobClaim(
    supabaseAdmin,
    job.message_id,
    queueHolder,
    holder,
  );
  if (!transferred) {
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

  try {
    const context = await loadAgentInboundResumeContext(supabaseAdmin, job);
    return { job, holder, ownership: claim.ownership, context };
  } catch (error) {
    // Context reconstruction happens after runtime ownership was established but
    // before the Agent V3 executor is invoked. Treat failure as uncertain
    // processing ownership and never make the message replayable automatically.
    await finalizeAgentInboundRuntimeOwnership(
      supabaseAdmin,
      claim.ownership,
      { ok: false, error },
    );
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
