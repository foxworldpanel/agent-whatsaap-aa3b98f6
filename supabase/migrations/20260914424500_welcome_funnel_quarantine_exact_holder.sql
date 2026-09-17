-- Ambiguous legacy Funnel quarantine is an ownership-sensitive transition.
-- Merely observing any lock for the conversation is insufficient: the caller
-- must prove that the exact holder it acquired still owns generation.
DROP FUNCTION IF EXISTS public.quarantine_ambiguous_welcome_funnel_claim(uuid,uuid,uuid,uuid,uuid);

CREATE OR REPLACE FUNCTION public.quarantine_ambiguous_welcome_funnel_claim(
  p_funnel_id uuid,
  p_contact_id uuid,
  p_conversation_id uuid,
  p_user_id uuid,
  p_workspace_id uuid,
  p_holder text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF nullif(btrim(p_holder), '') IS NULL THEN
    RAISE EXCEPTION 'ambiguous Welcome Funnel quarantine requires a lock holder'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_conversation_id::text, 31));

  SELECT status INTO v_status
  FROM public.welcome_funnel_execution_state
  WHERE funnel_id = p_funnel_id AND contact_id = p_contact_id;
  IF FOUND THEN RETURN v_status = 'needs_review'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.welcome_funnel_legacy_claim_baseline
    WHERE funnel_id = p_funnel_id AND contact_id = p_contact_id
  ) THEN
    RAISE EXCEPTION 'historical Welcome Funnel baseline cannot be quarantined as ambiguous'
      USING ERRCODE = '55000';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.welcome_funnel_runs
    WHERE funnel_id = p_funnel_id AND contact_id = p_contact_id
  ) THEN
    RAISE EXCEPTION 'ambiguous Welcome Funnel quarantine requires a legacy claim'
      USING ERRCODE = '55000';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.agent_generation_locks
    WHERE conversation_id = p_conversation_id
      AND holder = p_holder
  ) THEN
    RAISE EXCEPTION 'ambiguous Welcome Funnel quarantine requires exact generation lock ownership'
      USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.welcome_funnel_execution_state (
    funnel_id, contact_id, conversation_id, user_id, workspace_id,
    status, last_completed_step, error_message, started_at, updated_at, completed_at
  ) VALUES (
    p_funnel_id, p_contact_id, p_conversation_id, p_user_id, p_workspace_id,
    'running', NULL, NULL, now(), now(), NULL
  );

  UPDATE public.welcome_funnel_execution_state
  SET status = 'needs_review',
      error_message = 'legacy Welcome Funnel claim has no historical baseline or durable completion evidence',
      updated_at = now(), completed_at = NULL
  WHERE funnel_id = p_funnel_id
    AND contact_id = p_contact_id
    AND conversation_id = p_conversation_id
    AND status = 'running';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ambiguous Welcome Funnel quarantine transition was not persisted'
      USING ERRCODE = '55000';
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.quarantine_ambiguous_welcome_funnel_claim(uuid,uuid,uuid,uuid,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.quarantine_ambiguous_welcome_funnel_claim(uuid,uuid,uuid,uuid,uuid,text)
  TO service_role;
