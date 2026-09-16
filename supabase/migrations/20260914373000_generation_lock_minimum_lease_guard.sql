-- Fail closed against legacy/direct cleanup paths that still consider a live
-- generation lock stale before the canonical 20 minute lease horizon.
--
-- The shared acquisition/recovery RPCs already serialize on advisory seed 31.
-- This trigger is the database boundary for any remaining direct DELETE: it
-- takes the same conversation fence and silently refuses to delete a lease that
-- is younger than 20 minutes. A legacy caller then loses its retry INSERT to the
-- existing PK row instead of stealing an active Welcome Funnel/Agent runtime.
CREATE OR REPLACE FUNCTION public.guard_agent_generation_lock_minimum_lease()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(OLD.conversation_id::text,31));

  IF OLD.acquired_at > now() - interval '20 minutes' THEN
    RETURN NULL;
  END IF;

  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS guard_agent_generation_lock_minimum_lease
ON public.agent_generation_locks;
CREATE TRIGGER guard_agent_generation_lock_minimum_lease
BEFORE DELETE ON public.agent_generation_locks
FOR EACH ROW EXECUTE FUNCTION public.guard_agent_generation_lock_minimum_lease();

REVOKE ALL ON FUNCTION public.guard_agent_generation_lock_minimum_lease()
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_agent_generation_lock_minimum_lease()
TO service_role;
