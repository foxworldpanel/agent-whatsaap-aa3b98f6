-- Durable Welcome Funnel execution records are replay/side-effect evidence.
-- Runtime must never erase them. A future manual retry/reset flow needs an
-- explicit audited transition instead of deleting the evidence that external
-- sends may already have happened.
REVOKE DELETE ON TABLE public.welcome_funnel_execution_state FROM service_role;

CREATE OR REPLACE FUNCTION public.guard_welcome_funnel_execution_state_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 RAISE EXCEPTION 'welcome funnel durable execution state cannot be deleted';
END $$;

DROP TRIGGER IF EXISTS welcome_funnel_execution_state_delete_guard ON public.welcome_funnel_execution_state;
CREATE TRIGGER welcome_funnel_execution_state_delete_guard
BEFORE DELETE ON public.welcome_funnel_execution_state
FOR EACH ROW EXECUTE FUNCTION public.guard_welcome_funnel_execution_state_delete();

REVOKE ALL ON FUNCTION public.guard_welcome_funnel_execution_state_delete() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_welcome_funnel_execution_state_delete() TO service_role;
