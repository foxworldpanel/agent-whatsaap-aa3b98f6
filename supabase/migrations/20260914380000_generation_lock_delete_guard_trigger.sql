-- Ensure the canonical delete guard is actually enforced for every direct DELETE.
-- The function is hardened by 20260914373000, but defining/replacing a trigger
-- function alone does not attach it to agent_generation_locks.
DROP TRIGGER IF EXISTS agent_generation_locks_delete_guard ON public.agent_generation_locks;
CREATE TRIGGER agent_generation_locks_delete_guard
BEFORE DELETE ON public.agent_generation_locks
FOR EACH ROW EXECUTE FUNCTION public.guard_agent_generation_lock_delete();
