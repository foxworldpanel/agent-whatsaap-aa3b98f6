import { executeAgentV3Runtime } from "@/lib/agent-v3/runtime.server";
import {
  claimNextReadyCustomerTurn,
  finishCustomerTurn,
} from "@/lib/agent-v3/customer-turn.server";
import { buildCustomerTurnRuntimeInput } from "@/lib/agent-v3/customer-turn-runtime.server";
import type { AgentV3RuntimeTerminalReason } from "@/lib/agent-v3/inbound-runtime-result.server";

export type AgentCustomerTurnDispatchResult =
  | { status: "idle" }
  | { status: "processed"; turnId: string; memberCount: number; reason: AgentV3RuntimeTerminalReason }
  | { status: "needs_review"; turnId: string };

export async function dispatchOneCustomerTurn(
  supabaseAdmin: any,
  workerId: string,
): Promise<AgentCustomerTurnDispatchResult> {
  const holder = `customer-turn:${workerId}:${Date.now()}`;
  const turn = await claimNextReadyCustomerTurn(supabaseAdmin, holder);
  if (!turn) return { status: "idle" };

  try {
    const runtime = await buildCustomerTurnRuntimeInput(supabaseAdmin, turn.id);
    const result = await executeAgentV3Runtime(supabaseAdmin, runtime.input);
    if (result.class === "operational_attention") {
      await finishCustomerTurn(
        supabaseAdmin,
        turn.id,
        holder,
        { ok: false, error: new Error(`Agent V3 operational attention: ${result.reason}`) },
      );
      return { status: "needs_review", turnId: turn.id };
    }

    await finishCustomerTurn(supabaseAdmin, turn.id, holder, { ok: true });
    return {
      status: "processed",
      turnId: turn.id,
      memberCount: runtime.members.length,
      reason: result.reason,
    };
  } catch (error) {
    await finishCustomerTurn(supabaseAdmin, turn.id, holder, { ok: false, error });
    return { status: "needs_review", turnId: turn.id };
  }
}

export async function dispatchCustomerTurnBatch(
  supabaseAdmin: any,
  workerId: string,
  maxPerRun = 20,
): Promise<{ claimed: number; processed: number; needsReview: number; idle: boolean }> {
  const bounded = Math.max(1, Math.min(maxPerRun, 20));
  let claimed = 0;
  let processed = 0;
  let needsReview = 0;
  for (let index = 0; index < bounded; index += 1) {
    const result = await dispatchOneCustomerTurn(supabaseAdmin, workerId);
    if (result.status === "idle") return { claimed, processed, needsReview, idle: true };
    claimed += 1;
    if (result.status === "processed") processed += 1;
    if (result.status === "needs_review") needsReview += 1;
  }
  return { claimed, processed, needsReview, idle: false };
}
