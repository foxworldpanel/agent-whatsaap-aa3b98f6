-- Defense in depth for legacy webhook callers: a queued later message must never be
-- paired with the trigger message_id. The TypeScript ingress already canonicalizes
-- this path; enforce the same invariant for every direct Stage B INSERT.
CREATE OR REPLACE FUNCTION public.canonicalize_deferred_funnel_agent_inbound_job()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_message public.messages%ROWTYPE;
BEGIN
 IF NEW.deferred_funnel IS NOT TRUE THEN RETURN NEW; END IF;
 SELECT * INTO v_message FROM public.messages WHERE id=NEW.message_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'deferred funnel message identity is missing' USING ERRCODE='23503'; END IF;
 IF v_message.conversation_id IS DISTINCT FROM NEW.conversation_id OR v_message.workspace_id IS DISTINCT FROM NEW.workspace_id THEN
  RAISE EXCEPTION 'deferred funnel message identity crosses conversation/workspace' USING ERRCODE='23514';
 END IF;
 NEW.input_text:=coalesce(v_message.body,'');
 NEW.deferred_funnel:=false;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS canonicalize_deferred_funnel_agent_inbound_job ON public.agent_inbound_jobs;
CREATE TRIGGER canonicalize_deferred_funnel_agent_inbound_job
BEFORE INSERT ON public.agent_inbound_jobs
FOR EACH ROW EXECUTE FUNCTION public.canonicalize_deferred_funnel_agent_inbound_job();
REVOKE ALL ON FUNCTION public.canonicalize_deferred_funnel_agent_inbound_job() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.canonicalize_deferred_funnel_agent_inbound_job() TO service_role;
