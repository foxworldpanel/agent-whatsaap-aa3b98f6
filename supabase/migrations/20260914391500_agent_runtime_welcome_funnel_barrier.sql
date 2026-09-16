-- Durable Welcome Funnel state is an independent execution barrier. Even if a
-- generation-lock row is missing after a crash or legacy caller bug, neither
-- Customer Turn nor Stage B ownership may start while Funnel side effects are
-- active or uncertain.
CREATE OR REPLACE FUNCTION public.guard_agent_runtime_against_welcome_funnel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.state IN ('processing_safe','processing') AND NEW.state IS DISTINCT FROM OLD.state THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.conversation_id::text,31));
  IF EXISTS(SELECT 1 FROM public.welcome_funnel_execution_state s WHERE s.conversation_id=NEW.conversation_id AND s.status IN ('running','needs_review')) THEN
   RAISE EXCEPTION 'Agent Customer Turn blocked by durable Welcome Funnel barrier' USING ERRCODE='55000';
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS agent_customer_turn_welcome_funnel_barrier ON public.agent_customer_turns;
CREATE TRIGGER agent_customer_turn_welcome_funnel_barrier BEFORE UPDATE ON public.agent_customer_turns FOR EACH ROW EXECUTE FUNCTION public.guard_agent_runtime_against_welcome_funnel();
REVOKE ALL ON FUNCTION public.guard_agent_runtime_against_welcome_funnel() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_agent_runtime_against_welcome_funnel() TO service_role;

CREATE OR REPLACE FUNCTION public.guard_stage_b_runtime_against_welcome_funnel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.status IN ('processing_safe','processing') AND NEW.status IS DISTINCT FROM OLD.status THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.conversation_id::text,31));
  IF EXISTS(SELECT 1 FROM public.welcome_funnel_execution_state s WHERE s.conversation_id=NEW.conversation_id AND s.status IN ('running','needs_review')) THEN
   RAISE EXCEPTION 'Agent Stage B runtime blocked by durable Welcome Funnel barrier' USING ERRCODE='55000';
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS agent_inbound_job_welcome_funnel_barrier ON public.agent_inbound_jobs;
CREATE TRIGGER agent_inbound_job_welcome_funnel_barrier BEFORE UPDATE ON public.agent_inbound_jobs FOR EACH ROW EXECUTE FUNCTION public.guard_stage_b_runtime_against_welcome_funnel();
REVOKE ALL ON FUNCTION public.guard_stage_b_runtime_against_welcome_funnel() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_stage_b_runtime_against_welcome_funnel() TO service_role;
