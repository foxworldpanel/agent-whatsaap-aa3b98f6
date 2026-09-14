import { executeAgentV3Runtime } from "@/lib/agent-v3/runtime.server";
import {
  attachPendingAgentInboundJobsToCustomerTurns,
  claimNextReadyCustomerTurn,
  claimReadyCustomerTurnById,
  enterCustomerTurnRuntime,
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
    // Deterministic preparation errors are quarantined explicitly. A process
    // crash here is different: the durable state remains processing_safe and
    // stale recovery can safely reopen the turn because runtime never started.
    return quarantineClaimedCustomerTurn(s, turn, holder, error);
  }

  // This is the durable external-side-effect boundary. Only after the complete
  // semantic input exists do we mark the turn unsafe to replay. A lost RPC
  // response is resolved by durable read-back in enterCustomerTurnRuntime.
  const enteredRuntime = await enterCustomerTurnRuntime(s, turn.id, holder);
  if (!enteredRuntime) {
    throw new Error(`Customer Turn runtime transition rejected for ${turn.id}`);
  }

  let result;
  try {
    result = await executeAgentV3Runtime(s, runtime.input);
  } catch (error) {
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
  let consecutiveIdleClaims = 0;

  // A claim can legitimately return idle after selecting a candidate when a
  // concurrent worker wins that conversation's advisory fence first. Do not
  // abandon the whole batch on the first collision: retry a small bounded
  // number of times so unrelated ready conversations still make progress.
  const maxClaimAttempts = bounded + 3;
  for (let attempt = 0; attempt < maxClaimAttempts && claimed < bounded; attempt += 1) {
    const result = await dispatchOneCustomerTurn(s, workerId);
    if (result.status === "idle") {
      consecutiveIdleClaims += 1;
      if (consecutiveIdleClaims >= 3) {
        return { attached, recovered, claimed, processed, needsReview, idle: true };
      }
      continue;
    }

    consecutiveIdleClaims = 0;
    claimed += 1;
    if (result.status === "processed") processed += 1;
    if (result.status === "needs_review") needsReview += 1;
  }
  return { attached, recovered, claimed, processed, needsReview, idle: claimed < bounded };
}
