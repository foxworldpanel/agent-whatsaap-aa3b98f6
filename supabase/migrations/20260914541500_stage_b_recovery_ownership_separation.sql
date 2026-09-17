-- Stage B recovery owns Stage B claims only. Generation-lock cleanup has its own
-- canonical 20-minute recovery path; deleting locks here used the Stage B stale
-- cutoff and could violate the final lock privilege/lease fences.
CREATE OR REPLACE FUNCTION public.recover_stale_agent_inbound_jobs(p_stale_before timestamptz,p_max_attempts integer DEFAULT 5)
RETURNS TABLE(requeued integer,review integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_candidate record;v_requeued integer:=0;v_review integer:=0;v_changed integer:=0;v_safe_review integer:=0;v_locked integer:=0;
BEGIN
 IF p_max_attempts<1 THEN RAISE EXCEPTION 'p_max_attempts must be >= 1';END IF;
 FOR v_candidate IN SELECT grouped.conversation_id,grouped.oldest_claimed_at FROM(SELECT j.conversation_id,min(j.claimed_at) oldest_claimed_at FROM public.agent_inbound_jobs j WHERE j.status IN('processing_safe','processing') AND j.claimed_at<p_stale_before GROUP BY j.conversation_id)grouped ORDER BY grouped.oldest_claimed_at,grouped.conversation_id LIMIT 500 LOOP
  EXIT WHEN v_locked>=100;
  IF NOT pg_try_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31)) THEN CONTINUE;END IF;
  v_locked:=v_locked+1;
  WITH changed AS(UPDATE public.agent_inbound_jobs j SET status=CASE WHEN j.attempt_count>=p_max_attempts THEN 'needs_review' ELSE 'pending' END,claimed_by=NULL,claimed_at=NULL,last_error=CASE WHEN j.attempt_count>=p_max_attempts THEN 'stale processing_safe exceeded max attempts' ELSE 'recovered stale processing_safe claim' END,updated_at=now() WHERE j.conversation_id=v_candidate.conversation_id AND j.status='processing_safe' AND j.claimed_at<p_stale_before RETURNING status) SELECT count(*)FILTER(WHERE status='pending')::integer,count(*)FILTER(WHERE status='needs_review')::integer INTO v_changed,v_safe_review FROM changed;
  v_requeued:=v_requeued+COALESCE(v_changed,0);v_review:=v_review+COALESCE(v_safe_review,0);
  WITH unsafe AS(UPDATE public.agent_inbound_jobs j SET status='needs_review',claimed_by=NULL,claimed_at=NULL,last_error=COALESCE(j.last_error,'stale processing state; external side effect uncertain'),updated_at=now() WHERE j.conversation_id=v_candidate.conversation_id AND j.status='processing' AND j.claimed_at<p_stale_before RETURNING 1)SELECT count(*)::integer INTO v_changed FROM unsafe;
  v_review:=v_review+COALESCE(v_changed,0);
 END LOOP;
 RETURN QUERY SELECT v_requeued,v_review;
END$$;
REVOKE ALL ON FUNCTION public.recover_stale_agent_inbound_jobs(timestamptz,integer) FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION public.recover_stale_agent_inbound_jobs(timestamptz,integer) TO service_role;
