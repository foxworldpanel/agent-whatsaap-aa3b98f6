-- Keep the background pending attachment drain nonblocking across conversations
-- when a Welcome Funnel owns or quarantines one conversation.
CREATE OR REPLACE FUNCTION public.attach_pending_agent_inbound_jobs_to_customer_turns(p_limit integer DEFAULT 50)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_candidate record; v_attached integer:=0; v_turn_id uuid;
BEGIN
 FOR v_candidate IN
  SELECT candidate.id,candidate.conversation_id FROM (
   SELECT DISTINCT ON (j.conversation_id) j.id,j.conversation_id,j.created_at
   FROM public.agent_inbound_jobs j
   WHERE j.status='pending' AND j.claimed_by IS NULL
    AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages tm WHERE tm.job_id=j.id)
    AND NOT EXISTS(SELECT 1 FROM public.welcome_funnel_execution_state s WHERE s.conversation_id=j.conversation_id AND s.status IN ('running','needs_review'))
   ORDER BY j.conversation_id,j.created_at,j.id
  ) candidate ORDER BY candidate.created_at,candidate.id
  LIMIT greatest(1,least(coalesce(p_limit,50),200))
 LOOP
  IF NOT pg_try_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31)) THEN CONTINUE; END IF;
  IF EXISTS(SELECT 1 FROM public.welcome_funnel_execution_state s WHERE s.conversation_id=v_candidate.conversation_id AND s.status IN ('running','needs_review')) THEN CONTINUE; END IF;
  BEGIN
   v_turn_id:=public.attach_agent_inbound_job_to_customer_turn(v_candidate.id);
   IF v_turn_id IS NOT NULL THEN v_attached:=v_attached+1; END IF;
  EXCEPTION WHEN OTHERS THEN
   IF SQLERRM LIKE '%Welcome Funnel execution barrier%' THEN CONTINUE; END IF;
   RAISE;
  END;
 END LOOP;
 RETURN v_attached;
END $$;
REVOKE ALL ON FUNCTION public.attach_pending_agent_inbound_jobs_to_customer_turns(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.attach_pending_agent_inbound_jobs_to_customer_turns(integer) TO service_role;
