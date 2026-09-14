-- Preserve strict semantic ordering for the webhook-specific fast path too.
-- A specific newer collecting turn must never overtake an older retry_safe turn
-- from the same conversation. Likewise, a retry_safe turn must not overtake an
-- even older retry_safe turn if multiple safe pre-runtime crashes accumulated.

CREATE OR REPLACE FUNCTION public.claim_next_agent_customer_turn(
 p_holder text,p_quiet_before timestamptz
)
RETURNS SETOF public.agent_customer_turns
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_candidate_id uuid; v_conversation_id uuid;
BEGIN
 SELECT q.id,q.conversation_id INTO v_candidate_id,v_conversation_id
 FROM (
  SELECT t.id,t.conversation_id,t.created_at AS ready_at
  FROM public.agent_customer_turns t
  WHERE t.state='retry_safe'
    AND NOT EXISTS(
      SELECT 1 FROM public.agent_customer_turns older
      WHERE older.conversation_id=t.conversation_id
        AND older.state='retry_safe'
        AND (older.created_at,older.id)<(t.created_at,t.id)
    )
  UNION ALL
  SELECT t.id,t.conversation_id,t.last_received_at AS ready_at
  FROM public.agent_customer_turns t
  WHERE t.state='collecting' AND t.last_received_at<=p_quiet_before
    AND NOT EXISTS(
      SELECT 1 FROM public.agent_customer_turns older
      WHERE older.conversation_id=t.conversation_id AND older.state='retry_safe'
    )
 ) q
 ORDER BY q.ready_at,q.id LIMIT 1;
 IF NOT FOUND THEN RETURN; END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended(v_conversation_id::text,31));

 IF EXISTS(
   SELECT 1 FROM public.agent_customer_turns a
   WHERE a.conversation_id=v_conversation_id AND a.id<>v_candidate_id
     AND a.state IN ('processing_safe','processing')
 ) OR EXISTS(
   SELECT 1 FROM public.agent_inbound_jobs j
   WHERE j.conversation_id=v_conversation_id
     AND j.status IN ('processing_safe','processing')
 ) THEN RETURN; END IF;

 RETURN QUERY UPDATE public.agent_customer_turns t
 SET state='processing_safe',sealed_at=coalesce(t.sealed_at,now()),
     claimed_by=p_holder,claimed_at=now(),updated_at=now()
 WHERE t.id=v_candidate_id AND t.conversation_id=v_conversation_id
   AND (
    (t.state='retry_safe' AND NOT EXISTS(
      SELECT 1 FROM public.agent_customer_turns older
      WHERE older.conversation_id=v_conversation_id
        AND older.state='retry_safe'
        AND (older.created_at,older.id)<(t.created_at,t.id)
    ))
    OR
    (t.state='collecting' AND t.last_received_at<=p_quiet_before AND NOT EXISTS(
      SELECT 1 FROM public.agent_customer_turns older
      WHERE older.conversation_id=v_conversation_id AND older.state='retry_safe'
    ))
   )
 RETURNING t.*;
END $$;

CREATE OR REPLACE FUNCTION public.claim_agent_customer_turn(
 p_turn_id uuid,p_holder text,p_quiet_before timestamptz
)
RETURNS SETOF public.agent_customer_turns
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_conversation_id uuid;
BEGIN
 SELECT conversation_id INTO v_conversation_id
 FROM public.agent_customer_turns WHERE id=p_turn_id;
 IF NOT FOUND THEN RETURN; END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended(v_conversation_id::text,31));

 IF EXISTS(
   SELECT 1 FROM public.agent_customer_turns a
   WHERE a.conversation_id=v_conversation_id AND a.id<>p_turn_id
     AND a.state IN ('processing_safe','processing')
 ) OR EXISTS(
   SELECT 1 FROM public.agent_inbound_jobs j
   WHERE j.conversation_id=v_conversation_id
     AND j.status IN ('processing_safe','processing')
 ) THEN RETURN; END IF;

 RETURN QUERY UPDATE public.agent_customer_turns t
 SET state='processing_safe',sealed_at=coalesce(t.sealed_at,now()),
     claimed_by=p_holder,claimed_at=now(),updated_at=now()
 WHERE t.id=p_turn_id AND t.conversation_id=v_conversation_id
   AND (
    (t.state='retry_safe' AND NOT EXISTS(
      SELECT 1 FROM public.agent_customer_turns older
      WHERE older.conversation_id=v_conversation_id
        AND older.state='retry_safe'
        AND (older.created_at,older.id)<(t.created_at,t.id)
    ))
    OR
    (t.state='collecting' AND t.last_received_at<=p_quiet_before AND NOT EXISTS(
      SELECT 1 FROM public.agent_customer_turns older
      WHERE older.conversation_id=v_conversation_id AND older.state='retry_safe'
    ))
   )
 RETURNING t.*;
END $$;

REVOKE ALL ON FUNCTION public.claim_next_agent_customer_turn(text,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.claim_agent_customer_turn(uuid,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_agent_customer_turn(text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_agent_customer_turn(uuid,text,timestamptz) TO service_role;
