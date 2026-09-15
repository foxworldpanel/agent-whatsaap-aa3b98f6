-- 20260914310000 extended the review barrier to retry_safe turns but replaced the
-- quarantine function introduced by 20260914301500, accidentally dropping the
-- attached-member quarantine. Restore that invariant for both collecting and
-- retry_safe turns: once the semantic turn is quarantined, none of its attached
-- pending Stage B members may remain stranded in pending.

CREATE OR REPLACE FUNCTION public.quarantine_customer_turns_with_unattached_review(p_limit integer DEFAULT 100)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 v_candidate record;
 v_count integer:=0;
 v_target integer:=greatest(1,least(coalesce(p_limit,100),200));
BEGIN
 FOR v_candidate IN
  SELECT t.id,t.conversation_id,t.state,t.sealed_at
  FROM public.agent_customer_turns t
  WHERE (t.state='collecting' AND public.agent_turn_has_blocking_unattached_review(t.conversation_id,NULL))
     OR (t.state='retry_safe' AND public.agent_turn_has_blocking_unattached_review(t.conversation_id,t.sealed_at))
  ORDER BY t.created_at,t.id
  LIMIT least(v_target*5,500)
 LOOP
  EXIT WHEN v_count>=v_target;
  IF NOT pg_try_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31)) THEN CONTINUE; END IF;

  UPDATE public.agent_customer_turns t
  SET state='needs_review',claimed_by=NULL,claimed_at=NULL,
      last_error='unattached earlier inbound job requires review before semantic execution',updated_at=now()
  WHERE t.id=v_candidate.id AND t.conversation_id=v_candidate.conversation_id
    AND ((t.state='collecting' AND public.agent_turn_has_blocking_unattached_review(t.conversation_id,NULL))
      OR (t.state='retry_safe' AND public.agent_turn_has_blocking_unattached_review(t.conversation_id,t.sealed_at)));

  IF FOUND THEN
    UPDATE public.agent_inbound_jobs j
    SET status='needs_review',claimed_by=NULL,claimed_at=NULL,
        last_error=left(coalesce(j.last_error,'semantic turn blocked by unattached inbound review'),1000),updated_at=now()
    WHERE j.status='pending'
      AND EXISTS(
        SELECT 1 FROM public.agent_customer_turn_messages tm
        WHERE tm.turn_id=v_candidate.id AND tm.job_id=j.id
      );
    v_count:=v_count+1;
  END IF;
 END LOOP;
 RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION public.quarantine_customer_turns_with_unattached_review(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.quarantine_customer_turns_with_unattached_review(integer) TO service_role;
