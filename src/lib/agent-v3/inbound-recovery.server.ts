import {
  AGENT_INBOUND_MAX_SAFE_ATTEMPTS,
  recoverStaleAgentInboundJobs,
} from "@/lib/agent-v3/inbound-jobs.server";

/**
 * Recovery-only Stage B surface.
 *
 * Keep stale ownership recovery independent from the historical direct runtime
 * dispatcher so a cron recovery route never loads claim/runtime execution code.
 */
export async function recoverAgentInboundDispatcherClaims(
  supabaseAdmin: any,
  staleMs = 5 * 60 * 1000,
  maxAttempts = AGENT_INBOUND_MAX_SAFE_ATTEMPTS,
): Promise<{ requeued: number; review: number }> {
  const staleBefore = new Date(Date.now() - staleMs).toISOString();
  return recoverStaleAgentInboundJobs(supabaseAdmin, staleBefore, maxAttempts);
}
