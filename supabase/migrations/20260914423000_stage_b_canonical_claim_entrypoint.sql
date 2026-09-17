-- Keep every service-role Stage B claim entrypoint behind the same bounded,
-- conversation-fenced claimant. The historical claim_next_agent_inbound_job
-- function remains part of the RPC surface, so make it a compatibility alias
-- instead of leaving its older global exhaustion UPDATE reachable directly.
CREATE OR REPLACE FUNCTION public.claim_next_agent_inbound_job(
  p_holder text,
  p_max_attempts integer DEFAULT 5
)
RETURNS SETOF public.agent_inbound_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
BEGIN
  IF p_max_attempts < 1 THEN
    RAISE EXCEPTION 'p_max_attempts must be >= 1';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.claim_next_agent_inbound_job_fenced(p_holder, p_max_attempts);
END
$$;

REVOKE ALL ON FUNCTION public.claim_next_agent_inbound_job(text,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_agent_inbound_job(text,integer)
  TO service_role;
