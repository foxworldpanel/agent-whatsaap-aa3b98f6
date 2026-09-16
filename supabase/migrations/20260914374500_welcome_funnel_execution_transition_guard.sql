-- Welcome Funnel execution state is a durable safety record, not mutable CRM metadata.
-- Freeze execution identity and make terminal outcomes append-only. A future manual
-- retry/resume flow must create an explicit audited transition instead of rewriting
-- whether a previous external-send attempt completed or became uncertain.
CREATE OR REPLACE FUNCTION public.guard_welcome_funnel_execution_state_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.funnel_id IS DISTINCT FROM OLD.funnel_id
     OR NEW.contact_id IS DISTINCT FROM OLD.contact_id
     OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.started_at IS DISTINCT FROM OLD.started_at THEN
    RAISE EXCEPTION 'welcome funnel execution identity is immutable';
  END IF;

  IF OLD.status IN ('completed','needs_review') AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'welcome funnel terminal execution state is immutable';
  END IF;

  IF OLD.status = 'running' AND NEW.status NOT IN ('running','completed','needs_review') THEN
    RAISE EXCEPTION 'invalid welcome funnel execution transition: % -> %', OLD.status, NEW.status;
  END IF;

  IF OLD.last_completed_step IS NOT NULL THEN
    IF NEW.last_completed_step IS NULL THEN
      RAISE EXCEPTION 'welcome funnel checkpoint cannot move backwards';
    END IF;
    IF array_position(ARRAY['welcome_text','audio','panel_text','video','services_text']::text[], NEW.last_completed_step)
       < array_position(ARRAY['welcome_text','audio','panel_text','video','services_text']::text[], OLD.last_completed_step) THEN
      RAISE EXCEPTION 'welcome funnel checkpoint cannot move backwards';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS welcome_funnel_execution_state_transition_guard ON public.welcome_funnel_execution_state;
CREATE TRIGGER welcome_funnel_execution_state_transition_guard
BEFORE UPDATE ON public.welcome_funnel_execution_state
FOR EACH ROW EXECUTE FUNCTION public.guard_welcome_funnel_execution_state_transition();

REVOKE ALL ON FUNCTION public.guard_welcome_funnel_execution_state_transition() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_welcome_funnel_execution_state_transition() TO service_role;
