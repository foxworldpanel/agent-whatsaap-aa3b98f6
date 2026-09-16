-- Close the remaining split-brain window from legacy/direct DELETE callers.
-- Exact owner release remains allowed through release_agent_conversation_lock,
-- which sets the transaction-local capability below. All other deletion paths
-- must respect the canonical 20 minute generation-lock lease horizon.
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

 PERFORM pg_advisory_xact_lock(hashtextextended(OLD.conversation_id::text,31));

 -- A direct caller must never shorten the shared lease horizon. In particular,
 -- the legacy webhook's five-minute stale cleanup now fails closed instead of
 -- deleting a legitimate long-running Welcome Funnel lock.
 IF OLD.acquired_at > now() - interval '20 minutes' THEN
  RAISE EXCEPTION 'cannot delete active generation lock before canonical stale horizon'
    USING ERRCODE='55000';
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

REVOKE ALL ON FUNCTION public.guard_agent_generation_lock_delete() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_agent_generation_lock_delete() TO service_role;
