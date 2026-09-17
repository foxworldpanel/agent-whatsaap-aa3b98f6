-- Running Funnel + stale generation lock is a coupled ownership record. Generic
-- lock recovery skips it; this Funnel-specific recovery quarantines the uncertain
-- execution first and only then removes the same stale lock under one canonical
-- conversation fence. A fresh lock always blocks recovery.
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

  -- A fresh generation owner always wins. A stale Funnel-owned row is handled
  -- here as one coupled recovery; generic generation-lock recovery skips it.
  IF EXISTS(
   SELECT 1 FROM public.agent_generation_locks g
   WHERE g.conversation_id=v.conversation_id
     AND g.acquired_at>=p_generation_lock_stale_before
  ) THEN CONTINUE; END IF;

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

  -- Quarantine is durable before stale ownership is removed. The generation
  -- delete guard independently enforces the canonical minimum lease horizon.
  DELETE FROM public.agent_generation_locks g
   WHERE g.conversation_id=v.conversation_id
     AND g.acquired_at<p_generation_lock_stale_before;

  v_count:=v_count+1;
 END LOOP;
 RETURN v_count;
END
$$;

REVOKE ALL ON FUNCTION public.recover_stale_welcome_funnel_executions(timestamptz,timestamptz,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recover_stale_welcome_funnel_executions(timestamptz,timestamptz,integer) TO service_role;
