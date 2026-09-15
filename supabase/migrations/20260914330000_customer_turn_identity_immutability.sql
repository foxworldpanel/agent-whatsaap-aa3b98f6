-- Conversation/workspace identity is fixed when a semantic turn is created.
-- State/lease/timestamps used by the state machine remain writable, but moving an
-- existing turn across tenants or conversations would invalidate every fence.

CREATE OR REPLACE FUNCTION public.guard_agent_customer_turn_identity_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id
 OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
 OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
 OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
   RAISE EXCEPTION 'Customer Turn durable identity is immutable';
 END IF;
 RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_agent_customer_turn_identity_update ON public.agent_customer_turns;
CREATE TRIGGER guard_agent_customer_turn_identity_update
BEFORE UPDATE ON public.agent_customer_turns
FOR EACH ROW EXECUTE FUNCTION public.guard_agent_customer_turn_identity_update();

REVOKE ALL ON FUNCTION public.guard_agent_customer_turn_identity_update() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_agent_customer_turn_identity_update() TO service_role;
