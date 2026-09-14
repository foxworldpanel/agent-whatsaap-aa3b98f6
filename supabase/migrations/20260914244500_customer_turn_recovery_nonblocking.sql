-- Recovery is a background sweep and must not queue behind one live conversation.
-- Bound each transaction and use the shared advisory fence opportunistically;
-- skipped contention remains stale and is retried by the next cron pass.

CREATE OR REPLACE FUNCTION public.recover_stale_agent_customer_turns(p_stale_before timestamptz)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_candidate record; v_count integer:=0; v_changed integer:=0;
BEGIN
 FOR v_candidate IN
  SELECT id,conversation_id,state,claimed_by,claimed_at,safe_attempt_count
  FROM public.agent_customer_turns
  WHERE state IN ('processing_safe','processing') AND claimed_at<p_stale_before
  ORDER BY claimed_at,id
  LIMIT 100
 LOOP
  IF NOT pg_try_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31)) THEN
   CONTINUE;
  END IF;

  IF v_candidate.state='processing_safe' THEN
   UPDATE public.agent_customer_turns
   SET state=CASE WHEN safe_attempt_count>=5 THEN 'needs_review' ELSE 'retry_safe' END,
       claimed_by=null,claimed_at=null,
       last_error=CASE WHEN safe_attempt_count>=5
         THEN 'max safe pre-runtime customer turn attempts exceeded'
         ELSE 'recovered stale safe pre-runtime customer turn claim' END,
       updated_at=now()
   WHERE id=v_candidate.id
     AND conversation_id=v_candidate.conversation_id
     AND state='processing_safe'
     AND claimed_by IS NOT DISTINCT FROM v_candidate.claimed_by
     AND claimed_at IS NOT DISTINCT FROM v_candidate.claimed_at
     AND claimed_at<p_stale_before;
  ELSE
   UPDATE public.agent_customer_turns
   SET state='needs_review',claimed_by=null,claimed_at=null,
       last_error='recovered stale runtime-active customer turn claim',updated_at=now()
   WHERE id=v_candidate.id
     AND conversation_id=v_candidate.conversation_id
     AND state='processing'
     AND claimed_by IS NOT DISTINCT FROM v_candidate.claimed_by
     AND claimed_at IS NOT DISTINCT FROM v_candidate.claimed_at
     AND claimed_at<p_stale_before;
  END IF;
  GET DIAGNOSTICS v_changed=ROW_COUNT;
  v_count:=v_count+v_changed;
 END LOOP;
 RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION public.recover_stale_agent_customer_turns(timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recover_stale_agent_customer_turns(timestamptz) TO service_role;
