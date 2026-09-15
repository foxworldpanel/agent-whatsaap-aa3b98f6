-- The snapshot columns were backfilled from pre-snapshot rows. A historical CRM
-- message may have lacked a usable external identity; never let such a partially
-- reconstructed membership reach runtime as if it were complete.

CREATE OR REPLACE FUNCTION public.quarantine_incomplete_agent_customer_turn_snapshots(p_limit integer DEFAULT 100)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_candidate record; v_count integer:=0; v_target integer:=greatest(1,least(coalesce(p_limit,100),200));
BEGIN
 FOR v_candidate IN
  SELECT DISTINCT t.id,t.conversation_id
  FROM public.agent_customer_turns t
  JOIN public.agent_customer_turn_messages tm ON tm.turn_id=t.id
  WHERE t.state IN ('collecting','retry_safe')
    AND (nullif(btrim(coalesce(tm.external_id,'')),'') IS NULL
      OR tm.input_text IS NULL
      OR tm.input_kind IS NULL
      OR tm.input_kind NOT IN ('texto','audio','image','sticker'))
  ORDER BY t.id
  LIMIT least(v_target*5,500)
 LOOP
  EXIT WHEN v_count>=v_target;
  IF NOT pg_try_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31)) THEN CONTINUE; END IF;

  UPDATE public.agent_customer_turns t
  SET state='needs_review',claimed_by=NULL,claimed_at=NULL,
      last_error='incomplete durable Customer Turn member snapshot requires review',updated_at=now()
  WHERE t.id=v_candidate.id AND t.conversation_id=v_candidate.conversation_id
    AND t.state IN ('collecting','retry_safe')
    AND EXISTS(
      SELECT 1 FROM public.agent_customer_turn_messages tm
      WHERE tm.turn_id=t.id
        AND (nullif(btrim(coalesce(tm.external_id,'')),'') IS NULL
          OR tm.input_text IS NULL
          OR tm.input_kind IS NULL
          OR tm.input_kind NOT IN ('texto','audio','image','sticker'))
    );
  IF FOUND THEN
    UPDATE public.agent_inbound_jobs j
    SET status='needs_review',claimed_by=NULL,claimed_at=NULL,
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
