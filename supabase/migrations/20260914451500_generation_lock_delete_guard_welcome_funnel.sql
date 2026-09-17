-- Direct/legacy generation-lock deletion must preserve every durable runtime
-- owner, including a running Welcome Funnel. Funnel-specific stale recovery
-- transitions the execution to needs_review before deleting its stale lock, so
-- that path remains valid while arbitrary direct DELETE fails closed.
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
 ) OR EXISTS (
  SELECT 1 FROM public.welcome_funnel_execution_state f
  WHERE f.conversation_id=OLD.conversation_id
    AND f.status='running'
 ) THEN
  RAISE EXCEPTION 'cannot delete generation lock while durable runtime ownership is active'
    USING ERRCODE='55000';
 END IF;
 RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_agent_generation_lock_delete() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_agent_generation_lock_delete() TO service_role;
