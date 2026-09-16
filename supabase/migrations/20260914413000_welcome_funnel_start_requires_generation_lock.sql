-- Durable Funnel execution may only start while the conversation generation lock is held.
-- The lock holder is intentionally not coupled to a specific string here: acquisition is
-- already serialized by the generation-lock PK + seed-31 fence, while the runner's durable
-- state becomes the authoritative barrier once INSERT succeeds.
CREATE OR REPLACE FUNCTION public.guard_welcome_funnel_execution_start()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.conversation_id::text,31));
 IF NEW.status<>'running' THEN RAISE EXCEPTION 'welcome funnel execution must start in running state' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.agent_generation_locks g WHERE g.conversation_id=NEW.conversation_id) THEN
  RAISE EXCEPTION 'Welcome Funnel start requires conversation generation lock' USING ERRCODE='55000';
 END IF;
 IF EXISTS(SELECT 1 FROM public.agent_customer_turns t WHERE t.conversation_id=NEW.conversation_id AND t.state IN ('processing_safe','processing')) THEN
  RAISE EXCEPTION 'Welcome Funnel start blocked by active Customer Turn runtime' USING ERRCODE='55000';
 END IF;
 IF EXISTS(SELECT 1 FROM public.agent_inbound_jobs j WHERE j.conversation_id=NEW.conversation_id AND j.status IN ('processing_safe','processing')) THEN
  RAISE EXCEPTION 'Welcome Funnel start blocked by active Stage B runtime' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_welcome_funnel_execution_start() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_welcome_funnel_execution_start() TO service_role;
