-- A generation-lock owner must be able to release its own lock while durable
-- Stage B / Customer Turn ownership is still active. The delete trigger exists
-- to stop uncoordinated/stale deletion, so direct table DELETE cannot express
-- the distinction between the legitimate holder and a cleanup path.
--
-- Release therefore goes through this holder-aware RPC under the same shared
-- per-conversation advisory fence. The trigger is disabled only for the exact
-- owner-verified DELETE inside this SECURITY DEFINER function and is restored
-- before returning. Stale/non-owner cleanup remains guarded.

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
 -- longer owns the generation lock and therefore has nothing left to release.
 IF NOT FOUND THEN RETURN true; END IF;
 IF v_current_holder<>p_holder THEN RETURN true; END IF;

 -- The trigger protects arbitrary DELETEs. This transaction already proved
 -- exact holder ownership under the canonical advisory fence, so allow only
 -- this owner release through the protected table.
 ALTER TABLE public.agent_generation_locks DISABLE TRIGGER guard_agent_generation_lock_delete;
 BEGIN
  DELETE FROM public.agent_generation_locks
  WHERE conversation_id=p_conversation_id AND holder=p_holder;
 EXCEPTION WHEN OTHERS THEN
  ALTER TABLE public.agent_generation_locks ENABLE TRIGGER guard_agent_generation_lock_delete;
  RAISE;
 END;
 ALTER TABLE public.agent_generation_locks ENABLE TRIGGER guard_agent_generation_lock_delete;

 RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.release_agent_conversation_lock(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.release_agent_conversation_lock(uuid,text) TO service_role;
