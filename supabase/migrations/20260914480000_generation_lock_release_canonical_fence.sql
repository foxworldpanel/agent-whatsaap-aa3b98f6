-- Owner release must remain serialized with acquisition, recovery, Stage B,
-- Customer Turns and Welcome Funnel ownership under the canonical seed 31.
-- Reassert the exact-holder release contract after mutation privileges become
-- RPC-only.
CREATE OR REPLACE FUNCTION public.release_agent_conversation_lock(
 p_conversation_id uuid,
 p_holder text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public AS $$
DECLARE v_current_holder text;
BEGIN
 IF p_holder IS NULL OR btrim(p_holder)='' THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_conversation_id::text,31));
 SELECT holder INTO v_current_holder
 FROM public.agent_generation_locks
 WHERE conversation_id=p_conversation_id
 FOR UPDATE;
 IF NOT FOUND THEN RETURN true; END IF;
 IF v_current_holder<>p_holder THEN RETURN true; END IF;
 PERFORM set_config('agent_v3.release_conversation_id',p_conversation_id::text,true);
 PERFORM set_config('agent_v3.release_holder',p_holder,true);
 DELETE FROM public.agent_generation_locks
 WHERE conversation_id=p_conversation_id AND holder=p_holder;
 PERFORM set_config('agent_v3.release_conversation_id','',true);
 PERFORM set_config('agent_v3.release_holder','',true);
 RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.release_agent_conversation_lock(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.release_agent_conversation_lock(uuid,text) TO service_role;
