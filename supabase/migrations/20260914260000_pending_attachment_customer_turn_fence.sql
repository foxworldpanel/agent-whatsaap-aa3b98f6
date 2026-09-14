-- The catch-up attachment sweep owns the shared advisory fence, but it must also
-- revalidate runtime ownership before creating or extending a collecting turn.
-- A pending legacy Stage B job can coexist with another active Stage B owner for
-- the same conversation; attaching it while that runtime is active would let the
-- Customer Turn quiet window begin before the older runtime finishes.

CREATE OR REPLACE FUNCTION public.attach_pending_agent_inbound_jobs_to_customer_turns(p_limit integer DEFAULT 50)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 v_job record;
 v_locked_job public.agent_inbound_jobs%ROWTYPE;
 v_turn uuid;
 v_count integer:=0;
 v_target integer:=greatest(1,least(coalesce(p_limit,50),200));
BEGIN
 FOR v_job IN
  SELECT j.id,j.conversation_id
  FROM public.agent_inbound_jobs j
  WHERE j.status='pending'
    AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages tm WHERE tm.job_id=j.id)
  ORDER BY j.created_at,j.id
  LIMIT least(v_target*4,400)
 LOOP
  EXIT WHEN v_count>=v_target;
  IF NOT pg_try_advisory_xact_lock(hashtextextended(v_job.conversation_id::text,31)) THEN
   CONTINUE;
  END IF;

  SELECT * INTO v_locked_job
  FROM public.agent_inbound_jobs
  WHERE id=v_job.id
  FOR UPDATE;
  IF NOT FOUND OR v_locked_job.conversation_id<>v_job.conversation_id OR v_locked_job.status<>'pending' THEN
   CONTINUE;
  END IF;

  SELECT turn_id INTO v_turn
  FROM public.agent_customer_turn_messages
  WHERE job_id=v_job.id;
  IF FOUND THEN CONTINUE; END IF;

  -- Re-check all incompatible durable owners while holding seed 31. A retry_safe
  -- predecessor also has ordering priority and must finish before a new collecting
  -- successor is populated by the catch-up path.
  IF EXISTS(
    SELECT 1 FROM public.agent_inbound_jobs active_job
    WHERE active_job.conversation_id=v_job.conversation_id
      AND active_job.id<>v_job.id
      AND active_job.status IN ('processing_safe','processing')
  ) OR EXISTS(
    SELECT 1 FROM public.agent_customer_turns active_turn
    WHERE active_turn.conversation_id=v_job.conversation_id
      AND active_turn.state IN ('retry_safe','processing_safe','processing')
  ) OR EXISTS(
    SELECT 1 FROM public.agent_generation_locks generation_lock
    WHERE generation_lock.conversation_id=v_job.conversation_id
  ) THEN
    CONTINUE;
  END IF;

  SELECT id INTO v_turn
  FROM public.agent_customer_turns
  WHERE conversation_id=v_job.conversation_id AND state='collecting'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_turn IS NULL THEN
   INSERT INTO public.agent_customer_turns(conversation_id,workspace_id)
   VALUES(v_job.conversation_id,v_locked_job.workspace_id)
   RETURNING id INTO v_turn;
  ELSE
   UPDATE public.agent_customer_turns
   SET last_received_at=now(),updated_at=now()
   WHERE id=v_turn;
  END IF;

  INSERT INTO public.agent_customer_turn_messages(turn_id,job_id,message_id)
  VALUES(v_turn,v_locked_job.id,v_locked_job.message_id);
  v_count:=v_count+1;
 END LOOP;
 RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION public.attach_pending_agent_inbound_jobs_to_customer_turns(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.attach_pending_agent_inbound_jobs_to_customer_turns(integer) TO service_role;
