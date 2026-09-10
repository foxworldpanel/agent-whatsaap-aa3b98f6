export type AgentInboundDuplicateState = {
  duplicateInMemory: boolean;
  duplicateInDb: boolean;
  persistedMessageId: string | null;
};

/**
 * A duplicate provider delivery is not, by itself, proof that Agent V3 already
 * owns or processed the persisted inbound. The durable job is the source of
 * truth for that decision.
 *
 * This helper intentionally runs only after the webhook's fromMe/reaction/
 * funnel/agent eligibility gates. It closes the crash window where the first
 * delivery persisted `messages` but died before `agent_inbound_jobs` creation:
 * the retry is allowed to reach the durable ownership boundary using the same
 * persisted message id. Job creation/claim is idempotent and decides whether
 * runtime work is still required.
 */
export function shouldAttemptEligibleAgentInbound(
  state: AgentInboundDuplicateState,
): boolean {
  if (!state.persistedMessageId) return false;
  return true;
}

/**
 * Kept separate for logging/telemetry so callers can distinguish a repaired
 * provider retry from a first delivery without changing eligibility semantics.
 */
export function isAgentInboundRetryDelivery(
  state: AgentInboundDuplicateState,
): boolean {
  return state.duplicateInMemory || state.duplicateInDb;
}
