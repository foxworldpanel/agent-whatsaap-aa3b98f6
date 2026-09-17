-- Funnel stale recovery must not depend on the generic direct-DELETE escape hatch.
-- After the running execution is durably quarantined under the canonical fence,
-- grant a transaction-local capability only for the exact stale lock row being
-- recovered. The delete trigger remains fail-closed for every other caller.
CREATE OR REPLACE FUNCTION public.recover_stale_welcome_funnel_executions(
 p_stale_before timestamptz,
 p_generation_lock_stale_before timestamptz,
 p_limit integer DEFAULT 50
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
 v record;
 v_lock record;
 v_count integer:=0;
 v_limit integer:=greatest(1,least(coalesce(p_limit,50),200));
BEGIN
 IF p_stale_before IS NULL OR p_generation_lock_stale_before IS NULL THEN
  RAISE EXCEPTION 'stale recovery horizons are required';
 END IF;

 FOR v IN
  SELECT s.funnel_id,s.contact_id,s.conversation_id
  FROM public.welcome_funnel_execution_state s
  WHERE s.status='running' AND s.updated_at<p_stale_before
  ORDER BY s.updated_at,s.funnel_id,s.contact_id
  LIMIT least(v_limit*10,1000)
 LOOP
  EXIT WHEN v_count>=v_limit;
  IF NOT pg_try_advisory_xact_lock(hashtextextended(v.conversation_id::text,31)) THEN CONTINUE; END IF;

  IF EXISTS(
   SELECT 1 FROM public.agent_generation_locks g
   WHERE g.conversation_id=v.conversation_id
     AND g.acquired_at>=p_generation_lock_stale_before
  ) THEN CONTINUE; END IF;

  SELECT g.holder,g.acquired_at INTO v_lock
  FROM public.agent_generation_locks g
  WHERE g.conversation_id=v.conversation_id
    AND g.acquired_at<p_generation_lock_stale_before
  FOR UPDATE;

  UPDATE public.welcome_funnel_execution_state s
   SET status='needs_review',
       error_message='stale Welcome Funnel runtime recovered after uncertain external side effects',
       completed_at=NULL,
       updated_at=now()
   WHERE s.funnel_id=v.funnel_id
     AND s.contact_id=v.contact_id
     AND s.conversation_id=v.conversation_id
     AND s.status='running'
     AND s.updated_at<p_stale_before
     AND NOT EXISTS(
      SELECT 1 FROM public.agent_generation_locks g
      WHERE g.conversation_id=v.conversation_id
        AND g.acquired_at>=p_generation_lock_stale_before
     );
  IF NOT FOUND THEN CONTINUE; END IF;

  IF v_lock.holder IS NOT NULL THEN
   PERFORM set_config('agent_v3.release_conversation_id',v.conversation_id::text,true);
   PERFORM set_config('agent_v3.release_holder',v_lock.holder,true);

   DELETE FROM public.agent_generation_locks g
    WHERE g.conversation_id=v.conversation_id
      AND g.holder=v_lock.holder
      AND g.acquired_at=v_lock.acquired_at
      AND g.acquired_at<p_generation_lock_stale_before;

   PERFORM set_config('agent_v3.release_conversation_id','',true);
   PERFORM set_config('agent_v3.release_holder','',true);
  END IF;

  v_count:=v_count+1;
 END LOOP;
 RETURN v_count;
END
$$;

REVOKE ALL ON FUNCTION public.recover_stale_welcome_funnel_executions(timestamptz,timestamptz,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recover_stale_welcome_funnel_executions(timestamptz,timestamptz,integer) TO service_role;
