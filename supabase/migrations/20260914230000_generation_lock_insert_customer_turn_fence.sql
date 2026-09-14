-- Some existing callers (notably Welcome Funnel) still insert directly into
-- agent_generation_locks instead of using acquire_agent_conversation_lock().
-- Serialize those inserts in the same advisory namespace as Customer Turn
-- claims. Combined with the claim-side generation-lock check, this closes both
-- sides of the race: either the lock is inserted first and the turn waits, or
-- the turn is claimed first and the direct lock insertion is rejected.
--
-- Do not reject active Stage B here: the legacy Stage B runtime intentionally
-- acquires its generation lock while its own inbound job is processing_safe.

CREATE OR REPLACE FUNCTION public.guard_agent_generation_lock_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.conversation_id::text,31));

 IF EXISTS(
  SELECT 1 FROM public.agent_customer_turns t
  WHERE t.conversation_id=NEW.conversation_id
    AND t.state IN ('processing_safe','processing')
 ) THEN
  RAISE EXCEPTION 'cannot acquire generation lock while customer turn owns conversation %',NEW.conversation_id
    USING ERRCODE='55000';
 END IF;

 RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS agent_generation_locks_insert_guard ON public.agent_generation_locks;
CREATE TRIGGER agent_generation_locks_insert_guard
BEFORE INSERT ON public.agent_generation_locks
FOR EACH ROW EXECUTE FUNCTION public.guard_agent_generation_lock_insert();

REVOKE ALL ON FUNCTION public.guard_agent_generation_lock_insert() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_agent_generation_lock_insert() TO service_role;
