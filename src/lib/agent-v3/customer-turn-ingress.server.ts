import { ensureAgentInboundJob, type EnsureAgentInboundJobInput } from "@/lib/agent-v3/inbound-jobs.server";
import { attachAgentInboundJobToCustomerTurn } from "@/lib/agent-v3/customer-turn.server";

export type CustomerTurnIngressResult = {
  jobId: string;
  turnId: string;
  duplicate: boolean;
};

/**
 * Stage C ingress boundary. Eligible webhook messages become durable Stage B
 * jobs first, then are attached idempotently to a collecting Customer Turn.
 * No runtime side effect is allowed between these two durable steps.
 */
export async function enqueueAgentInboundIntoCustomerTurn(
  supabaseAdmin: any,
  input: EnsureAgentInboundJobInput,
): Promise<CustomerTurnIngressResult> {
  const ensured = await ensureAgentInboundJob(supabaseAdmin, input);
  const turnId = await attachAgentInboundJobToCustomerTurn(supabaseAdmin, ensured.job.id);
  return { jobId: ensured.job.id, turnId, duplicate: ensured.duplicate };
}
