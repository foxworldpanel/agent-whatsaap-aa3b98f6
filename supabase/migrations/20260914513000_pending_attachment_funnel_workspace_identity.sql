-- Canonical pending drain: preserve fairness while failing closed on Funnel routing
-- identity mismatch. Every job is checked with its own durable workspace snapshot.
CREATE OR REPLACE FUNCTION public.attach_pending_agent_inbound_jobs_to_customer_turns(p_limit integer DEFAULT 50)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_conversation record;v_job public.agent_inbound_jobs%ROWTYPE;v_turn uuid;v_turn_workspace uuid;v_count integer:=0;v_conversation_count integer;v_target integer:=greatest(1,least(coalesce(p_limit,50),200));v_per_conversation integer:=least(16,greatest(1,ceil(v_target::numeric/4)::integer));
BEGIN
 FOR v_conversation IN SELECT c.conversation_id,c.workspace_id,c.created_at,c.id FROM(SELECT DISTINCT ON(j.conversation_id)j.conversation_id,j.workspace_id,j.created_at,j.id FROM public.agent_inbound_jobs j WHERE j.status='pending' AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages tm WHERE tm.job_id=j.id) AND NOT public.has_welcome_funnel_agent_barrier(j.conversation_id,j.workspace_id) ORDER BY j.conversation_id,j.created_at,j.id)c ORDER BY c.created_at,c.id LIMIT least(v_target*10,1000) LOOP
  EXIT WHEN v_count>=v_target;IF NOT pg_try_advisory_xact_lock(hashtextextended(v_conversation.conversation_id::text,31)) THEN CONTINUE;END IF;
  IF public.has_welcome_funnel_agent_barrier(v_conversation.conversation_id,v_conversation.workspace_id) OR EXISTS(SELECT 1 FROM public.agent_inbound_jobs a WHERE a.conversation_id=v_conversation.conversation_id AND a.status IN('processing_safe','processing')) OR EXISTS(SELECT 1 FROM public.agent_customer_turns t WHERE t.conversation_id=v_conversation.conversation_id AND t.state IN('retry_safe','processing_safe','processing')) OR EXISTS(SELECT 1 FROM public.agent_generation_locks g WHERE g.conversation_id=v_conversation.conversation_id) THEN CONTINUE;END IF;
  v_turn:=NULL;v_turn_workspace:=NULL;v_conversation_count:=0;SELECT id,workspace_id INTO v_turn,v_turn_workspace FROM public.agent_customer_turns WHERE conversation_id=v_conversation.conversation_id AND state='collecting' ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  FOR v_job IN SELECT j.* FROM public.agent_inbound_jobs j WHERE j.conversation_id=v_conversation.conversation_id AND j.status='pending' AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages tm WHERE tm.job_id=j.id) ORDER BY j.created_at,j.id FOR UPDATE OF j SKIP LOCKED LOOP
   EXIT WHEN v_count>=v_target OR v_conversation_count>=v_per_conversation;
   EXIT WHEN public.has_welcome_funnel_agent_barrier(v_job.conversation_id,v_job.workspace_id) OR EXISTS(SELECT 1 FROM public.agent_inbound_jobs a WHERE a.conversation_id=v_job.conversation_id AND a.status IN('processing_safe','processing')) OR EXISTS(SELECT 1 FROM public.agent_customer_turns t WHERE t.conversation_id=v_job.conversation_id AND t.state IN('retry_safe','processing_safe','processing')) OR EXISTS(SELECT 1 FROM public.agent_generation_locks g WHERE g.conversation_id=v_job.conversation_id);
   IF v_turn IS NOT NULL AND v_turn_workspace IS DISTINCT FROM v_job.workspace_id THEN RAISE EXCEPTION 'Pending attachment Customer Turn workspace mismatch' USING ERRCODE='55000';END IF;
   IF v_turn IS NULL THEN INSERT INTO public.agent_customer_turns(conversation_id,workspace_id)VALUES(v_job.conversation_id,v_job.workspace_id)RETURNING id,workspace_id INTO v_turn,v_turn_workspace;END IF;
   INSERT INTO public.agent_customer_turn_messages(turn_id,job_id,message_id)VALUES(v_turn,v_job.id,v_job.message_id)ON CONFLICT(job_id)DO NOTHING;IF FOUND THEN v_count:=v_count+1;v_conversation_count:=v_conversation_count+1;END IF;
  END LOOP;
  IF v_turn IS NOT NULL AND v_conversation_count>0 THEN UPDATE public.agent_customer_turns SET last_received_at=now(),updated_at=now()WHERE id=v_turn AND state='collecting';END IF;
 END LOOP;RETURN v_count;
END$$;
REVOKE ALL ON FUNCTION public.attach_pending_agent_inbound_jobs_to_customer_turns(integer) FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION public.attach_pending_agent_inbound_jobs_to_customer_turns(integer) TO service_role;
