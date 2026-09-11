import { dispatchOneAgentInbound } from "@/lib/agent-v3/inbound-job-dispatch.server";
import { executeAgentV3Runtime } from "@/lib/agent-v3/runtime.server";

export const AGENT_INBOUND_DISPATCH_MAX_PER_RUN = 20;

export type AgentInboundBatchDispatchResult = {
  claimed: number;
  processed: number;
  needsReview: number;
  idle: boolean;
};

/**
 * Bounded safety-net drain for durable Agent V3 inbound jobs.
 *
 * The dispatcher imports the exact same runtime used by the webhook. This is
 * intentionally a static import instead of a process-local registry: a fresh
 * serverless/worker process must be able to execute a claimed job without
 * relying on another request having registered an executor first.
 */
export async function dispatchAgentInboundBatch(
  supabaseAdmin: any,
  workerId: string,
  maxPerRun = AGENT_INBOUND_DISPATCH_MAX_PER_RUN,
): Promise<AgentInboundBatchDispatchResult> {
  const boundedMax = Math.max(1, Math.min(maxPerRun, AGENT_INBOUND_DISPATCH_MAX_PER_RUN));
  let claimed = 0;
  let processed = 0;
  let needsReview = 0;

  for (let index = 0; index < boundedMax; index += 1) {
    const result = await dispatchOneAgentInbound(
      supabaseAdmin,
      workerId,
      executeAgentV3Runtime,
    );

    if (result.status === "idle") {
      return { claimed, processed, needsReview, idle: true };
    }

    claimed += 1;
    if (result.status === "processed") processed += 1;
    if (result.status === "needs_review") needsReview += 1;
  }

  return { claimed, processed, needsReview, idle: false };
}
