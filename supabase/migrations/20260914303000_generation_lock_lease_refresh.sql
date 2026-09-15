-- Long synchronous owners (notably Welcome Funnel) can legitimately hold a
-- generation lock for longer than the 5 minute orphan threshold. Refresh the
-- lease under the canonical conversation fence so orphan recovery cannot delete
-- a live lock between ownership verification and timestamp renewal.

CREATE OR REPLACE FUNCTION public.refresh_agent_conversation_lock(
 p_conversation_id uuid,
 p_holder text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 v_changed integer:=0;
BEGIN
 IF p_conversation_id IS NULL OR nullif(p_holder,'') IS NULL THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_conversation_id::text,31));
 UPDATE public.agent_generation_locks
 SET acquired_at=now()
 WHERE conversation_id=p_conversation_id AND holder=p_holder;
 GET DIAGNOSTICS v_changed=ROW_COUNT;
 RETURN v_changed=1;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_agent_conversation_lock(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_agent_conversation_lock(uuid,text) TO service_role;
