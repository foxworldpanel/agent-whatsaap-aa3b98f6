-- Generation locks are part of the same per-conversation ownership domain as
-- Stage B jobs and Stage C Customer Turns. Use the shared advisory namespace
-- (seed 31) and refuse stale lock replacement/deletion while either durable
-- runtime owner is active.

CREATE OR REPLACE FUNCTION public.guard_agent_generation_lock_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF EXISTS (
  SELECT 1 FROM public.agent_inbound_jobs j
  WHERE j.conversation_id=OLD.conversation_id
    AND j.status IN ('processing_safe','processing')
 ) OR EXISTS (
  SELECT 1 FROM public.agent_customer_turns t
  WHERE t.conversation_id=OLD.conversation_id
    AND t.state IN ('processing_safe','processing')
 ) THEN
  RAISE EXCEPTION 'cannot delete generation lock while durable inbound ownership is active'
    USING ERRCODE='55000';
 END IF;
 RETURN OLD;
END; $$;

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
 PERFORM pg_advisory_xact_lock(hashtextextended(p_conversation_id::text,31));

 SELECT holder,acquired_at INTO v_current_holder,v_acquired_at
 FROM public.agent_generation_locks
 WHERE conversation_id=p_conversation_id
 FOR UPDATE;

 IF NOT FOUND THEN
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
 ) THEN
  RETURN false;
 END IF;

 DELETE FROM public.agent_generation_locks
 WHERE conversation_id=p_conversation_id AND holder=v_current_holder;
 INSERT INTO public.agent_generation_locks(conversation_id,holder,acquired_at)
 VALUES(p_conversation_id,p_holder,now());
 RETURN true;
END; $$;

REVOKE ALL ON FUNCTION public.guard_agent_generation_lock_delete() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.acquire_agent_conversation_lock(uuid,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_agent_generation_lock_delete() TO service_role;
GRANT EXECUTE ON FUNCTION public.acquire_agent_conversation_lock(uuid,text,timestamptz) TO service_role;
