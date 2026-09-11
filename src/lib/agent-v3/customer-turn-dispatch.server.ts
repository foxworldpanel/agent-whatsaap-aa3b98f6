import { executeAgentV3Runtime } from "@/lib/agent-v3/runtime.server";
import {
  attachPendingAgentInboundJobsToCustomerTurns,
  claimNextReadyCustomerTurn,
  claimReadyCustomerTurnById,
  finishCustomerTurn,
  recoverStaleCustomerTurns,
  type AgentCustomerTurn,
} from "@/lib/agent-v3/customer-turn.server";
import { buildCustomerTurnRuntimeInput } from "@/lib/agent-v3/customer-turn-runtime.server";
import type { AgentV3RuntimeTerminalReason } from "@/lib/agent-v3/inbound-runtime-result.server";

export type AgentCustomerTurnDispatchResult =
  | { status: "idle" }
  | { status: "processed"; turnId: string; memberCount: number; reason: AgentV3RuntimeTerminalReason }
  | { status: "needs_review"; turnId: string };

async function executeClaimedCustomerTurn(
  s: any,
  turn: AgentCustomerTurn,
  holder: string,
): Promise<AgentCustomerTurnDispatchResult> {
  try {
    const runtime = await buildCustomerTurnRuntimeInput(s, turn.id);
    const result = await executeAgentV3Runtime(s, runtime.input);
    if (result.class === "operational_attention") {
      await finishCustomerTurn(s, turn.id, holder, {
        ok: false,
        error: new Error(`Agent V3 operational attention: ${result.reason}`),
      });
      return { status: "needs_review", turnId: turn.id };
    }
    await finishCustomerTurn(s, turn.id, holder, { ok: true });
    return {
      status: "processed",
      turnId: turn.id,
      memberCount: runtime.members.length,
      reason: result.reason,
    };
  } catch (error) {
    await finishCustomerTurn(s, turn.id, holder, { ok: false, error });
    return { status: "needs_review", turnId: turn.id };
  }
}

export async function dispatchReadyCustomerTurnById(
  s: any,
  turnId: string,
  workerId: string,
): Promise<AgentCustomerTurnDispatchResult> {
  const holder = `customer-turn-fast:${workerId}:${Date.now()}`;
  const turn = await claimReadyCustomerTurnById(s, turnId, holder);
  if (!turn) return { status: "idle" };
  return executeClaimedCustomerTurn(s, turn, holder);
}

export async function dispatchOneCustomerTurn(s: any, workerId: string): Promise<AgentCustomerTurnDispatchResult> {
  const holder = `customer-turn:${workerId}:${Date.now()}`;
  const turn = await claimNextReadyCustomerTurn(s, holder);
  if (!turn) return { status: "idle" };
  return executeClaimedCustomerTurn(s, turn, holder);
}

export async function dispatchCustomerTurnBatch(
  s: any,
  workerId: string,
  maxPerRun = 20,
): Promise<{ attached: number; recovered: number; claimed: number; processed: number; needsReview: number; idle: boolean }> {
  const recovered = await recoverStaleCustomerTurns(s);
  const attached = await attachPendingAgentInboundJobsToCustomerTurns(s, Math.max(20, maxPerRun * 4));
  const bounded = Math.max(1, Math.min(maxPerRun, 20));
  let claimed = 0;
  let processed = 0;
  let needsReview = 0;
  for (let index = 0; index < bounded; index += 1) {
    const result = await dispatchOneCustomerTurn(s, workerId);
    if (result.status === "idle") return { attached, recovered, claimed, processed, needsReview, idle: true };
    claimed += 1;
    if (result.status === "processed") processed += 1;
    if (result.status === "needs_review") needsReview += 1;
  }
  return { attached, recovered, claimed, processed, needsReview, idle: false };
}
