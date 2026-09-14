-- Stage B stale recovery must use the same conversation fence as Stage C and
-- must not attempt to delete a generation lock that an active Customer Turn
-- still protects. Otherwise the delete guard can abort the whole recovery RPC.
CREATE OR REPLACE FUNCTION public.recover_stale_agent_inbound_jobs(
 p_stale_before timestamptz,p_max_attempts integer DEFAULT 5
)
RETURNS TABLE(requeued integer,review integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 v_requeued integer:=0;
 v_review integer:=0;
 v_unsafe_review integer:=0;
 v_stale_conversations uuid[]:=ARRAY[]::uuid[];
 v_stale_conversation uuid;
BEGIN
 IF p_max_attempts<1 THEN RAISE EXCEPTION 'p_max_attempts must be >= 1'; END IF;

 SELECT COALESCE(array_agg(DISTINCT conversation_id ORDER BY conversation_id),ARRAY[]::uuid[])
 INTO v_stale_conversations
 FROM public.agent_inbound_jobs
 WHERE status IN ('processing_safe','processing') AND claimed_at<p_stale_before;

 FOR v_stale_conversation IN
  SELECT conversation_id
  FROM unnest(v_stale_conversations) AS recovered(conversation_id)
  ORDER BY conversation_id
 LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(v_stale_conversation::text,31));
 END LOOP;

 WITH changed AS (
  UPDATE public.agent_inbound_jobs
  SET status=CASE WHEN attempt_count>=p_max_attempts THEN 'needs_review' ELSE 'pending' END,
      claimed_by=NULL,claimed_at=NULL,
      last_error=CASE WHEN attempt_count>=p_max_attempts
        THEN 'stale processing_safe exceeded max attempts'
        ELSE 'recovered stale processing_safe claim' END,
      updated_at=now()
  WHERE status='processing_safe' AND claimed_at<p_stale_before
  RETURNING status
 )
 SELECT count(*) FILTER(WHERE status='pending')::integer,
        count(*) FILTER(WHERE status='needs_review')::integer
 INTO v_requeued,v_review FROM changed;

 WITH unsafe AS (
  UPDATE public.agent_inbound_jobs
  SET status='needs_review',claimed_by=NULL,claimed_at=NULL,
      last_error=COALESCE(last_error,'stale processing state; external side effect uncertain'),
      updated_at=now()
  WHERE status='processing' AND claimed_at<p_stale_before
  RETURNING 1
 )
 SELECT count(*)::integer INTO v_unsafe_review FROM unsafe;
 v_review:=v_review+v_unsafe_review;

 DELETE FROM public.agent_generation_locks l
 WHERE l.conversation_id=ANY(v_stale_conversations)
   AND l.acquired_at<p_stale_before
   AND NOT EXISTS(
    SELECT 1 FROM public.agent_inbound_jobs active
    WHERE active.conversation_id=l.conversation_id
      AND active.status IN ('processing_safe','processing')
   )
   AND NOT EXISTS(
    SELECT 1 FROM public.agent_customer_turns active_turn
    WHERE active_turn.conversation_id=l.conversation_id
      AND active_turn.state IN ('processing_safe','processing')
   );

 RETURN QUERY SELECT v_requeued,v_review;
END; $$;

REVOKE ALL ON FUNCTION public.recover_stale_agent_inbound_jobs(timestamptz,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recover_stale_agent_inbound_jobs(timestamptz,integer) TO service_role;
