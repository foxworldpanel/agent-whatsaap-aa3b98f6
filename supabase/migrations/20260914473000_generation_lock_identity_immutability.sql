-- Defense-in-depth: generation lock holder identity is immutable. Holder changes
-- are ownership replacement and must be expressed as fenced delete+insert inside
-- the canonical acquisition/recovery RPCs, never as UPDATE.
CREATE OR REPLACE FUNCTION public.guard_agent_generation_lock_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public AS $$
BEGIN
 IF NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
    OR NEW.holder IS DISTINCT FROM OLD.holder THEN
  RAISE EXCEPTION 'generation lock identity is immutable'
    USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agent_generation_locks_update_guard ON public.agent_generation_locks;
CREATE TRIGGER agent_generation_locks_update_guard
BEFORE UPDATE ON public.agent_generation_locks
FOR EACH ROW EXECUTE FUNCTION public.guard_agent_generation_lock_update();

REVOKE ALL ON FUNCTION public.guard_agent_generation_lock_update() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_agent_generation_lock_update() TO service_role;
