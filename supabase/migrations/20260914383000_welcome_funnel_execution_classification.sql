-- Centralize replay classification so callers cannot equate a legacy claim with
-- successful delivery. Baseline rows are migration-time compatibility evidence;
-- any newer legacy claim without durable state is ambiguous and must be reviewed.
CREATE OR REPLACE FUNCTION public.classify_welcome_funnel_execution(
 p_funnel_id uuid,
 p_contact_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public AS $$
DECLARE v_status text;
BEGIN
 SELECT status INTO v_status
 FROM public.welcome_funnel_execution_state
 WHERE funnel_id=p_funnel_id AND contact_id=p_contact_id;
 IF FOUND THEN RETURN 'durable_'||v_status; END IF;

 IF EXISTS(
  SELECT 1 FROM public.welcome_funnel_legacy_claim_baseline
  WHERE funnel_id=p_funnel_id AND contact_id=p_contact_id
 ) THEN RETURN 'legacy_compatible'; END IF;

 IF EXISTS(
  SELECT 1 FROM public.welcome_funnel_runs
  WHERE funnel_id=p_funnel_id AND contact_id=p_contact_id
 ) THEN RETURN 'legacy_ambiguous'; END IF;

 RETURN 'unclaimed';
END $$;
REVOKE ALL ON FUNCTION public.classify_welcome_funnel_execution(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.classify_welcome_funnel_execution(uuid,uuid) TO service_role;
