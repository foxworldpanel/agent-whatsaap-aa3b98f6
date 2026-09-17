-- Lease refresh is the only ordinary UPDATE on a generation lock. Serialize it
-- in the same seed-31 namespace and refresh only the exact durable holder.
CREATE OR REPLACE FUNCTION public.refresh_agent_conversation_lock(
 p_conversation_id uuid,
 p_holder text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public AS $$
BEGIN
 IF p_holder IS NULL OR btrim(p_holder)='' THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_conversation_id::text,31));

 UPDATE public.agent_generation_locks
 SET acquired_at=now()
 WHERE conversation_id=p_conversation_id
   AND holder=p_holder;
 RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_agent_conversation_lock(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_agent_conversation_lock(uuid,text) TO service_role;
