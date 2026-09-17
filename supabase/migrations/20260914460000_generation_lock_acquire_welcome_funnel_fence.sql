-- Canonical generation-lock acquisition must honor every durable conversation
-- owner. A running Welcome Funnel remains ownership even when its lock row is
-- stale or temporarily missing; acquisition must not steal/replace ownership.
CREATE OR REPLACE FUNCTION public.acquire_agent_conversation_lock(
 p_conversation_id uuid,
 p_holder text,
 p_stale_before timestamptz
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 v_current_holder text;
 v_acquired_at timestamptz;
BEGIN
 IF p_holder IS NULL OR btrim(p_holder)='' THEN RETURN false; END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended(p_conversation_id::text,31));

 SELECT holder,acquired_at INTO v_current_holder,v_acquired_at
 FROM public.agent_generation_locks
 WHERE conversation_id=p_conversation_id
 FOR UPDATE;

 IF NOT FOUND THEN
  IF EXISTS (
   SELECT 1 FROM public.agent_inbound_jobs j
   WHERE j.conversation_id=p_conversation_id
     AND j.status IN ('processing_safe','processing')
  ) OR EXISTS (
   SELECT 1 FROM public.agent_customer_turns t
   WHERE t.conversation_id=p_conversation_id
     AND t.state IN ('processing_safe','processing')
  ) OR EXISTS (
   SELECT 1 FROM public.welcome_funnel_execution_state f
   WHERE f.conversation_id=p_conversation_id
     AND f.status='running'
  ) THEN
   RETURN false;
  END IF;

  INSERT INTO public.agent_generation_locks(conversation_id,holder,acquired_at)
  VALUES(p_conversation_id,p_holder,now());
  RETURN true;
 END IF;

 IF v_current_holder=p_holder THEN RETURN true; END IF;
 IF v_acquired_at>=p_stale_before THEN RETURN false; END IF;

 IF EXISTS (
  SELECT 1 FROM public.agent_inbound_jobs j
  WHERE j.conversation_id=p_conversation_id
    AND j.status IN ('processing_safe','processing')
 ) OR EXISTS (
  SELECT 1 FROM public.agent_customer_turns t
  WHERE t.conversation_id=p_conversation_id
    AND t.state IN ('processing_safe','processing')
 ) OR EXISTS (
  SELECT 1 FROM public.welcome_funnel_execution_state f
  WHERE f.conversation_id=p_conversation_id
    AND f.status='running'
 ) THEN
  RETURN false;
 END IF;

 -- The delete trigger rejects ordinary cleanup before the canonical horizon.
 -- This branch is reached only when the caller's canonical stale cutoff proves
 -- replacement is eligible, so grant a transaction-local exact-row capability.
 PERFORM set_config('agent_v3.release_conversation_id',p_conversation_id::text,true);
 PERFORM set_config('agent_v3.release_holder',v_current_holder,true);
 DELETE FROM public.agent_generation_locks
 WHERE conversation_id=p_conversation_id AND holder=v_current_holder;
 PERFORM set_config('agent_v3.release_conversation_id','',true);
 PERFORM set_config('agent_v3.release_holder','',true);

 INSERT INTO public.agent_generation_locks(conversation_id,holder,acquired_at)
 VALUES(p_conversation_id,p_holder,now());
 RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.acquire_agent_conversation_lock(uuid,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_agent_conversation_lock(uuid,text,timestamptz) TO service_role;
