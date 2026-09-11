import { dispatchOneAgentInbound } from "@/lib/agent-v3/inbound-job-dispatch.server";
import type { AgentV3RuntimeExecutor } from "@/lib/agent-v3/inbound-runtime-contract.server";

export const AGENT_INBOUND_DISPATCH_MAX_PER_RUN = 20;

export type AgentInboundDispatchBatchResult = {
  claimed: number;
  processed: number;
  needsReview: number;
  idle: boolean;
};

/**
 * Bounded dispatcher drain used by the eventual cron/worker boundary.
 *
 * Stage B deliberately caps each invocation so a backlog cannot monopolize a
 * serverless request forever. Every item still crosses the durable claim +
 * conversation lock boundary in dispatchOneAgentInbound before runtime starts.
 */
export async function dispatchAgentInboundBatch(
  supabaseAdmin: any,
  workerId: string,
  executeRuntime: AgentV3RuntimeExecutor,
  maxPerRun = AGENT_INBOUND_DISPATCH_MAX_PER_RUN,
): Promise<AgentInboundDispatchBatchResult> {
  if (!Number.isInteger(maxPerRun) || maxPerRun < 1 || maxPerRun > 100) {
    throw new Error("agent inbound dispatcher maxPerRun must be an integer between 1 and 100");
  }

  let claimed = 0;
  let processed = 0;
  let needsReview = 0;

  for (let index = 0; index < maxPerRun; index += 1) {
    const result = await dispatchOneAgentInbound(
      supabaseAdmin,
      `${workerId}:${index}`,
      executeRuntime,
    );

    if (result === "idle") {
      return { claimed, processed, needsReview, idle: true };
    }

    claimed += 1;
    if (result === "processed") processed += 1;
    else needsReview += 1;
  }

  return { claimed, processed, needsReview, idle: false };
}
