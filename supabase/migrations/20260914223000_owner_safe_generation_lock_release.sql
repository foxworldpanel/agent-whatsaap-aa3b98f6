-- A generation-lock owner must be able to release its own lock while durable
-- Stage B / Customer Turn ownership is still active. Direct DELETE cannot
-- distinguish legitimate owner release from stale/uncoordinated cleanup.
--
-- Keep the trigger enabled globally. The owner-aware RPC proves exact holder
-- ownership under advisory seed 31 and sets transaction-local release identity;
-- the trigger bypasses its active-owner rejection only for that exact row.

CREATE OR REPLACE FUNCTION public.guard_agent_generation_lock_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 v_release_conversation text:=current_setting('agent_v3.release_conversation_id',true);
 v_release_holder text:=current_setting('agent_v3.release_holder',true);
BEGIN
 IF v_release_conversation=OLD.conversation_id::text
    AND v_release_holder=OLD.holder THEN
  RETURN OLD;
 END IF;

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
END;
$$;

CREATE OR REPLACE FUNCTION public.release_agent_conversation_lock(
 p_conversation_id uuid,
 p_holder text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
 v_current_holder text;
BEGIN
 IF p_holder IS NULL OR btrim(p_holder)='' THEN RETURN false; END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended(p_conversation_id::text,31));

 SELECT holder INTO v_current_holder
 FROM public.agent_generation_locks
 WHERE conversation_id=p_conversation_id
 FOR UPDATE;

 -- Idempotent release: no row or a successor holder means this holder no
 -- longer owns the generation lock and has nothing left to release.
 IF NOT FOUND THEN RETURN true; END IF;
 IF v_current_holder<>p_holder THEN RETURN true; END IF;

 PERFORM set_config('agent_v3.release_conversation_id',p_conversation_id::text,true);
 PERFORM set_config('agent_v3.release_holder',p_holder,true);

 DELETE FROM public.agent_generation_locks
 WHERE conversation_id=p_conversation_id AND holder=p_holder;

 -- Clear the transaction-local capability immediately so later statements in
 -- the same transaction cannot reuse it accidentally.
 PERFORM set_config('agent_v3.release_conversation_id','',true);
 PERFORM set_config('agent_v3.release_holder','',true);
 RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_agent_generation_lock_delete() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.release_agent_conversation_lock(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_agent_generation_lock_delete() TO service_role;
GRANT EXECUTE ON FUNCTION public.release_agent_conversation_lock(uuid,text) TO service_role;
