-- A crash after Funnel runtime starts must never leave the conversation blocked forever.
-- Runtime-active work is unsafe to replay automatically because external sends may have
-- happened. Quarantine stale running state to needs_review, but never steal a conversation
-- whose canonical generation-lock lease is still fresh.
CREATE OR REPLACE FUNCTION public.recover_stale_welcome_funnel_executions(
 p_stale_before timestamptz,
 p_generation_lock_stale_before timestamptz,
 p_limit integer DEFAULT 50
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v record; v_count integer:=0; v_limit integer:=greatest(1,least(coalesce(p_limit,50),200));
BEGIN
 FOR v IN
  SELECT s.funnel_id,s.contact_id,s.conversation_id
  FROM public.welcome_funnel_execution_state s
  WHERE s.status='running' AND s.updated_at<p_stale_before
  ORDER BY s.updated_at,s.funnel_id,s.contact_id
  LIMIT least(v_limit*10,1000)
 LOOP
  EXIT WHEN v_count>=v_limit;
  IF NOT pg_try_advisory_xact_lock(hashtextextended(v.conversation_id::text,31)) THEN CONTINUE; END IF;
  IF EXISTS(SELECT 1 FROM public.agent_generation_locks g WHERE g.conversation_id=v.conversation_id AND g.acquired_at>=p_generation_lock_stale_before) THEN CONTINUE; END IF;
  UPDATE public.welcome_funnel_execution_state s
   SET status='needs_review',error_message='stale Welcome Funnel runtime recovered after uncertain external side effects',completed_at=NULL,updated_at=now()
   WHERE s.funnel_id=v.funnel_id AND s.contact_id=v.contact_id AND s.conversation_id=v.conversation_id
    AND s.status='running' AND s.updated_at<p_stale_before;
  IF FOUND THEN v_count:=v_count+1; END IF;
 END LOOP;
 RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.recover_stale_welcome_funnel_executions(timestamptz,timestamptz,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recover_stale_welcome_funnel_executions(timestamptz,timestamptz,integer) TO service_role;
