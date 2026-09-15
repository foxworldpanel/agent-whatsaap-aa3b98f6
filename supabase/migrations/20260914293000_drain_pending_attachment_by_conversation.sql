-- Once a conversation wins the nonblocking seed-31 fence, drain its pending,
-- unattached Stage B jobs into the same collecting Customer Turn instead of attaching
-- only one row. This preserves fairness between conversations while avoiding one
-- scheduler minute per message for a burst. The Customer Turn claim barrier remains
-- the final defense if new inbound arrives after this transaction commits.

CREATE OR REPLACE FUNCTION public.attach_pending_agent_inbound_jobs_to_customer_turns(p_limit integer DEFAULT 50)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 v_conversation record;
 v_job public.agent_inbound_jobs%ROWTYPE;
 v_turn uuid;
 v_count integer:=0;
 v_target integer:=greatest(1,least(coalesce(p_limit,50),200));
BEGIN
 FOR v_conversation IN
  SELECT candidate.conversation_id,candidate.created_at,candidate.id
  FROM (
    SELECT DISTINCT ON (j.conversation_id) j.conversation_id,j.created_at,j.id
    FROM public.agent_inbound_jobs j
    WHERE j.status='pending'
      AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages tm WHERE tm.job_id=j.id)
    ORDER BY j.conversation_id,j.created_at,j.id
  ) candidate
  ORDER BY candidate.created_at,candidate.id
  LIMIT least(v_target*10,1000)
 LOOP
  EXIT WHEN v_count>=v_target;
  IF NOT pg_try_advisory_xact_lock(hashtextextended(v_conversation.conversation_id::text,31)) THEN CONTINUE; END IF;

  IF EXISTS(
    SELECT 1 FROM public.agent_inbound_jobs active_job
    WHERE active_job.conversation_id=v_conversation.conversation_id
      AND active_job.status IN ('processing_safe','processing')
  ) OR EXISTS(
    SELECT 1 FROM public.agent_customer_turns active_turn
    WHERE active_turn.conversation_id=v_conversation.conversation_id
      AND active_turn.state IN ('retry_safe','processing_safe','processing')
  ) OR EXISTS(
    SELECT 1 FROM public.agent_generation_locks generation_lock
    WHERE generation_lock.conversation_id=v_conversation.conversation_id
  ) THEN CONTINUE; END IF;

  v_turn:=NULL;
  SELECT id INTO v_turn
  FROM public.agent_customer_turns
  WHERE conversation_id=v_conversation.conversation_id AND state='collecting'
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

  FOR v_job IN
    SELECT j.*
    FROM public.agent_inbound_jobs j
    WHERE j.conversation_id=v_conversation.conversation_id AND j.status='pending'
      AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages tm WHERE tm.job_id=j.id)
    ORDER BY j.created_at,j.id
    FOR UPDATE OF j SKIP LOCKED
  LOOP
    EXIT WHEN v_count>=v_target;

    -- Recheck durable owners while the shared conversation fence is still held.
    EXIT WHEN EXISTS(
      SELECT 1 FROM public.agent_inbound_jobs active_job
      WHERE active_job.conversation_id=v_conversation.conversation_id
        AND active_job.status IN ('processing_safe','processing')
    ) OR EXISTS(
      SELECT 1 FROM public.agent_customer_turns active_turn
      WHERE active_turn.conversation_id=v_conversation.conversation_id
        AND active_turn.state IN ('retry_safe','processing_safe','processing')
    ) OR EXISTS(
      SELECT 1 FROM public.agent_generation_locks generation_lock
      WHERE generation_lock.conversation_id=v_conversation.conversation_id
    );

    IF v_turn IS NULL THEN
      INSERT INTO public.agent_customer_turns(conversation_id,workspace_id)
      VALUES(v_conversation.conversation_id,v_job.workspace_id) RETURNING id INTO v_turn;
    END IF;

    INSERT INTO public.agent_customer_turn_messages(turn_id,job_id,message_id)
    VALUES(v_turn,v_job.id,v_job.message_id)
    ON CONFLICT (job_id) DO NOTHING;
    IF FOUND THEN
      v_count:=v_count+1;
    END IF;
  END LOOP;

  IF v_turn IS NOT NULL THEN
    UPDATE public.agent_customer_turns
    SET last_received_at=now(),updated_at=now()
    WHERE id=v_turn AND state='collecting';
  END IF;
 END LOOP;
 RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION public.attach_pending_agent_inbound_jobs_to_customer_turns(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.attach_pending_agent_inbound_jobs_to_customer_turns(integer) TO service_role;
