-- Stage B jobs are durable semantic ingress snapshots. Ownership/retry fields may
-- transition, but routing/content identity must never drift after acceptance.
CREATE OR REPLACE FUNCTION public.guard_agent_inbound_job_snapshot_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.message_id IS DISTINCT FROM OLD.message_id
 OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
 OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
 OR NEW.send_target IS DISTINCT FROM OLD.send_target
 OR NEW.input_text IS DISTINCT FROM OLD.input_text
 OR NEW.input_kind IS DISTINCT FROM OLD.input_kind
 OR NEW.input_mime IS DISTINCT FROM OLD.input_mime
 OR NEW.deferred_funnel IS DISTINCT FROM OLD.deferred_funnel
 OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
  RAISE EXCEPTION 'Agent inbound semantic snapshot is immutable';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_agent_inbound_job_snapshot_update ON public.agent_inbound_jobs;
CREATE TRIGGER guard_agent_inbound_job_snapshot_update
BEFORE UPDATE ON public.agent_inbound_jobs
FOR EACH ROW EXECUTE FUNCTION public.guard_agent_inbound_job_snapshot_update();
REVOKE ALL ON FUNCTION public.guard_agent_inbound_job_snapshot_update() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_agent_inbound_job_snapshot_update() TO service_role;
