-- Keep orphan-lock recovery bounded. Advisory xact locks live until the RPC
-- transaction ends, so scanning an unbounded stale set could accumulate locks
-- and make one cron invocation unnecessarily large. One pass handles at most
-- 100 oldest stale locks; later scheduled passes drain any remainder.

CREATE OR REPLACE FUNCTION public.recover_stale_agent_generation_locks(
 p_stale_before timestamptz
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
 v_candidate record;
 v_count integer:=0;
 v_changed integer:=0;
BEGIN
 FOR v_candidate IN
  SELECT conversation_id,holder,acquired_at
  FROM public.agent_generation_locks
  WHERE acquired_at<p_stale_before
  ORDER BY acquired_at,conversation_id
  LIMIT 100
 LOOP
  IF NOT pg_try_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31)) THEN
   CONTINUE;
  END IF;

  DELETE FROM public.agent_generation_locks l
  WHERE l.conversation_id=v_candidate.conversation_id
    AND l.holder=v_candidate.holder
    AND l.acquired_at=v_candidate.acquired_at
    AND l.acquired_at<p_stale_before
    AND NOT EXISTS(
      SELECT 1 FROM public.agent_inbound_jobs active_job
      WHERE active_job.conversation_id=l.conversation_id
        AND active_job.status IN ('processing_safe','processing')
    )
    AND NOT EXISTS(
      SELECT 1 FROM public.agent_customer_turns active_turn
      WHERE active_turn.conversation_id=l.conversation_id
        AND active_turn.state IN ('processing_safe','processing')
    );
  GET DIAGNOSTICS v_changed=ROW_COUNT;
  v_count:=v_count+v_changed;
 END LOOP;
 RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.recover_stale_agent_generation_locks(timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recover_stale_agent_generation_locks(timestamptz) TO service_role;
