-- Make the Welcome Funnel barrier symmetric. Agent runtime already refuses to start
-- behind running/needs_review Funnel state; Funnel state creation must likewise
-- refuse to begin while Stage B or Customer Turn runtime owns the conversation.
CREATE OR REPLACE FUNCTION public.guard_welcome_funnel_execution_start()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.conversation_id::text,31));
 IF NEW.status<>'running' THEN RAISE EXCEPTION 'welcome funnel execution must start in running state' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM public.agent_customer_turns t WHERE t.conversation_id=NEW.conversation_id AND t.state IN ('processing_safe','processing')) THEN
  RAISE EXCEPTION 'Welcome Funnel start blocked by active Customer Turn runtime' USING ERRCODE='55000';
 END IF;
 IF EXISTS(SELECT 1 FROM public.agent_inbound_jobs j WHERE j.conversation_id=NEW.conversation_id AND j.status IN ('processing_safe','processing')) THEN
  RAISE EXCEPTION 'Welcome Funnel start blocked by active Stage B runtime' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS welcome_funnel_execution_start_guard ON public.welcome_funnel_execution_state;
CREATE TRIGGER welcome_funnel_execution_start_guard
BEFORE INSERT ON public.welcome_funnel_execution_state
FOR EACH ROW EXECUTE FUNCTION public.guard_welcome_funnel_execution_start();
REVOKE ALL ON FUNCTION public.guard_welcome_funnel_execution_start() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_welcome_funnel_execution_start() TO service_role;
