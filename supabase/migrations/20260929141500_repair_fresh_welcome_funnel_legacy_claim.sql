-- A runtime path still writes welcome_funnel_runs immediately before the durable
-- orchestrator classifies a brand-new trigger. That row is not historical delivery
-- evidence. Allow the exact fresh claim to be removed under the orchestrator's
-- existing generation/advisory fences, while preserving old/uncertain claims.
CREATE OR REPLACE FUNCTION public.clear_fresh_welcome_funnel_legacy_claim(
  p_funnel_id uuid,
  p_contact_id uuid,
  p_user_id uuid,
  p_workspace_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deleted integer := 0;
BEGIN
  DELETE FROM public.welcome_funnel_runs r
  WHERE r.funnel_id = p_funnel_id
    AND r.contact_id = p_contact_id
    AND r.user_id = p_user_id
    AND r.workspace_id = p_workspace_id
    AND r.fired_at >= now() - interval '2 minutes'
    AND NOT EXISTS (
      SELECT 1
      FROM public.welcome_funnel_legacy_claim_baseline b
      WHERE b.funnel_id = r.funnel_id
        AND b.contact_id = r.contact_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.welcome_funnel_execution_state s
      WHERE s.funnel_id = r.funnel_id
        AND s.contact_id = r.contact_id
    );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.clear_fresh_welcome_funnel_legacy_claim(uuid,uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_fresh_welcome_funnel_legacy_claim(uuid,uuid,uuid,uuid) TO service_role;
