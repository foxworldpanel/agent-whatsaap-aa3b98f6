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

async function quarantineClaimedCustomerTurn(
  s: any,
  turn: AgentCustomerTurn,
  holder: string,
  error: unknown,
): Promise<AgentCustomerTurnDispatchResult> {
  await finishCustomerTurn(s, turn.id, holder, { ok: false, error });
  return { status: "needs_review", turnId: turn.id };
}

async function executeClaimedCustomerTurn(
  s: any,
  turn: AgentCustomerTurn,
  holder: string,
): Promise<AgentCustomerTurnDispatchResult> {
  let runtime;
  try {
    runtime = await buildCustomerTurnRuntimeInput(s, turn.id);
  } catch (error) {
    // No Agent V3 side effects have started yet, so a deterministic/transient
    // preparation failure can be safely quarantined under the current holder.
    return quarantineClaimedCustomerTurn(s, turn, holder, error);
  }

  let result;
  try {
    result = await executeAgentV3Runtime(s, runtime.input);
  } catch (error) {
    // Runtime may already have produced external side effects. Move the turn to
    // needs_review once. If that terminal transition is itself uncertain,
    // finishCustomerTurn throws after durable read-back and we MUST propagate it
    // instead of attempting a second contradictory terminal transition.
    return quarantineClaimedCustomerTurn(s, turn, holder, error);
  }

  if (result.class === "operational_attention") {
    return quarantineClaimedCustomerTurn(
      s,
      turn,
      holder,
      new Error(`Agent V3 operational attention: ${result.reason}`),
    );
  }

  // A successful runtime is already across the external side-effect boundary.
  // Do not catch a finalization uncertainty and then try to rewrite the same turn
  // as needs_review: that would hide whether the processed commit actually won.
  await finishCustomerTurn(s, turn.id, holder, { ok: true });
  return {
    status: "processed",
    turnId: turn.id,
    memberCount: runtime.members.length,
    reason: result.reason,
  };
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
