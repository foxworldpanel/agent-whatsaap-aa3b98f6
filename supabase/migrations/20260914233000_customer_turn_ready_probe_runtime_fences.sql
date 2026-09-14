-- Readiness must mean claimable semantic work, not merely a quiet/retry row.
-- A ready Customer Turn can still be fenced by another active durable owner or
-- by the generation lock (for example, a synchronous Welcome Funnel). Reporting
-- such a row as ready makes dispatcher batches look perpetually non-idle while
-- there is intentionally nothing they are allowed to claim.

CREATE OR REPLACE FUNCTION public.has_ready_agent_customer_turn(
 p_quiet_before timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=public
AS $$
 SELECT EXISTS(
  SELECT 1
  FROM public.agent_customer_turns t
  WHERE t.safe_attempt_count<5
    AND (
      (
        t.state='retry_safe'
        AND NOT EXISTS(
          SELECT 1 FROM public.agent_customer_turns older
          WHERE older.conversation_id=t.conversation_id
            AND older.state='retry_safe'
            AND (older.created_at,older.id)<(t.created_at,t.id)
        )
      )
      OR
      (
        t.state='collecting'
        AND t.last_received_at<=p_quiet_before
        AND NOT EXISTS(
          SELECT 1 FROM public.agent_customer_turns older
          WHERE older.conversation_id=t.conversation_id
            AND older.state='retry_safe'
        )
      )
    )
    AND NOT EXISTS(
      SELECT 1 FROM public.agent_customer_turns active_turn
      WHERE active_turn.conversation_id=t.conversation_id
        AND active_turn.id<>t.id
        AND active_turn.state IN ('processing_safe','processing')
    )
    AND NOT EXISTS(
      SELECT 1 FROM public.agent_inbound_jobs active_job
      WHERE active_job.conversation_id=t.conversation_id
        AND active_job.status IN ('processing_safe','processing')
    )
    AND NOT EXISTS(
      SELECT 1 FROM public.agent_generation_locks generation_lock
      WHERE generation_lock.conversation_id=t.conversation_id
    )
 );
$$;

REVOKE ALL ON FUNCTION public.has_ready_agent_customer_turn(timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.has_ready_agent_customer_turn(timestamptz) TO service_role;
