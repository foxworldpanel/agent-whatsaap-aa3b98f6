-- A collecting/retry_safe turn with zero durable members cannot produce a
-- semantic runtime input. Quarantine it directly instead of burning all safe
-- retry attempts on a permanently unreconstructable snapshot.

CREATE OR REPLACE FUNCTION public.quarantine_incomplete_agent_customer_turn_snapshots(p_limit integer DEFAULT 100)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_candidate record; v_count integer:=0; v_target integer:=greatest(1,least(coalesce(p_limit,100),200));
BEGIN
 FOR v_candidate IN
  SELECT t.id,t.conversation_id
  FROM public.agent_customer_turns t
  WHERE t.state IN ('collecting','retry_safe')
    AND (
      NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages tm WHERE tm.turn_id=t.id)
      OR EXISTS(
        SELECT 1 FROM public.agent_customer_turn_messages tm WHERE tm.turn_id=t.id
        AND (nullif(btrim(coalesce(tm.external_id,'')),'') IS NULL
          OR tm.input_text IS NULL OR tm.input_kind IS NULL
          OR tm.input_kind NOT IN ('texto','audio','image','sticker')
          OR nullif(btrim(coalesce(tm.send_target,'')),'') IS NULL
          OR tm.deferred_funnel IS NULL OR tm.user_id IS NULL OR tm.contact_id IS NULL
          OR tm.whatsapp_number_id IS NULL
          OR nullif(btrim(coalesce(tm.contact_phone,'')),'') IS NULL)
      )
    )
  ORDER BY t.created_at,t.id LIMIT least(v_target*5,500)
 LOOP
  EXIT WHEN v_count>=v_target;
  IF NOT pg_try_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31)) THEN CONTINUE; END IF;
  UPDATE public.agent_customer_turns t
  SET state='needs_review',claimed_by=NULL,claimed_at=NULL,
      last_error=CASE WHEN NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages tm WHERE tm.turn_id=t.id)
        THEN 'empty durable Customer Turn snapshot requires review'
        ELSE 'incomplete durable Customer Turn member snapshot requires review' END,
      updated_at=now()
  WHERE t.id=v_candidate.id AND t.conversation_id=v_candidate.conversation_id
    AND t.state IN ('collecting','retry_safe')
    AND (NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages tm WHERE tm.turn_id=t.id)
      OR EXISTS(SELECT 1 FROM public.agent_customer_turn_messages tm WHERE tm.turn_id=t.id
        AND (nullif(btrim(coalesce(tm.external_id,'')),'') IS NULL OR tm.input_text IS NULL OR tm.input_kind IS NULL
          OR tm.input_kind NOT IN ('texto','audio','image','sticker') OR nullif(btrim(coalesce(tm.send_target,'')),'') IS NULL
          OR tm.deferred_funnel IS NULL OR tm.user_id IS NULL OR tm.contact_id IS NULL OR tm.whatsapp_number_id IS NULL
          OR nullif(btrim(coalesce(tm.contact_phone,'')),'') IS NULL)));
  IF FOUND THEN
    UPDATE public.agent_inbound_jobs j SET status='needs_review',claimed_by=NULL,claimed_at=NULL,
      last_error='Customer Turn member snapshot incomplete',updated_at=now()
    FROM public.agent_customer_turn_messages tm
    WHERE tm.turn_id=v_candidate.id AND tm.job_id=j.id AND j.status='pending';
    v_count:=v_count+1;
  END IF;
 END LOOP;
 RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION public.quarantine_incomplete_agent_customer_turn_snapshots(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.quarantine_incomplete_agent_customer_turn_snapshots(integer) TO service_role;
