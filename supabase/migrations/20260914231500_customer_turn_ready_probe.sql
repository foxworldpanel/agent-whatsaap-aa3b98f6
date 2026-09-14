-- A batch claim can return no row because its oldest candidate is temporarily
-- fenced by another worker / generation owner. That does not mean the durable
-- queue is empty. Expose a read-only readiness probe so the dispatcher can
-- distinguish true idle from ready work that remains contended.

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
 );
$$;

REVOKE ALL ON FUNCTION public.has_ready_agent_customer_turn(timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.has_ready_agent_customer_turn(timestamptz) TO service_role;
