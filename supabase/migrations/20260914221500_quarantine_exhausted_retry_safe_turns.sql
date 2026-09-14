-- Defensive repair for impossible/corrupted retry_safe rows at or above the
-- safe-attempt ceiling. Normal recovery never creates these rows: the fifth
-- failed processing_safe claim goes directly to needs_review. If manual repair,
-- a partial historical migration, or future code ever leaves one behind, it
-- must not permanently fence newer turns and Stage B fallback for the
-- conversation.

CREATE OR REPLACE FUNCTION public.quarantine_exhausted_agent_customer_turns()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
 v_candidate record;
 v_count integer:=0;
BEGIN
 FOR v_candidate IN
  SELECT id,conversation_id
  FROM public.agent_customer_turns
  WHERE state='retry_safe' AND safe_attempt_count>=5
  ORDER BY created_at,id
 LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31));

  UPDATE public.agent_customer_turns
  SET state='needs_review',
      claimed_by=NULL,
      claimed_at=NULL,
      last_error='max safe pre-runtime customer turn attempts exceeded',
      updated_at=now()
  WHERE id=v_candidate.id
    AND state='retry_safe'
    AND safe_attempt_count>=5;

  IF FOUND THEN
   UPDATE public.agent_inbound_jobs j
   SET status='needs_review',
       claimed_by=NULL,
       claimed_at=NULL,
       last_error='customer turn exhausted safe pre-runtime attempts',
       updated_at=now()
   WHERE j.id IN (
    SELECT tm.job_id
    FROM public.agent_customer_turn_messages tm
    WHERE tm.turn_id=v_candidate.id
   )
   AND j.status='pending';
   v_count:=v_count+1;
  END IF;
 END LOOP;
 RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.quarantine_exhausted_agent_customer_turns() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.quarantine_exhausted_agent_customer_turns() TO service_role;
