-- Legacy rows are compatibility/audit history only. New code must not be able to
-- manufacture a legacy claim and later interpret its existence as successful send.
-- Allow an INSERT only when a matching durable running execution already exists;
-- this preserves optional history mirroring while making durable state authoritative.
CREATE OR REPLACE FUNCTION public.guard_welcome_funnel_legacy_claim_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT EXISTS(
  SELECT 1 FROM public.welcome_funnel_execution_state s
  WHERE s.funnel_id=NEW.funnel_id AND s.contact_id=NEW.contact_id
    AND s.workspace_id=NEW.workspace_id AND s.status='running'
 ) THEN
  RAISE EXCEPTION 'legacy Welcome Funnel claim requires durable running execution state'
   USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS welcome_funnel_legacy_claim_insert_guard ON public.welcome_funnel_runs;
CREATE TRIGGER welcome_funnel_legacy_claim_insert_guard BEFORE INSERT ON public.welcome_funnel_runs
FOR EACH ROW EXECUTE FUNCTION public.guard_welcome_funnel_legacy_claim_insert();
REVOKE ALL ON FUNCTION public.guard_welcome_funnel_legacy_claim_insert() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_welcome_funnel_legacy_claim_insert() TO service_role;
