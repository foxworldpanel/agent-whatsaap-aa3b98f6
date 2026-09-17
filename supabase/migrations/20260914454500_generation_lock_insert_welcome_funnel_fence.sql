-- A running Welcome Funnel is durable conversation ownership even if its
-- generation-lock row is temporarily missing/stale. Do not let a new Agent or
-- legacy generation owner insert a replacement lock and overlap that runtime.
-- Normal Funnel start is unaffected: it acquires the generation lock before it
-- creates the durable running execution row; heartbeat refreshes use UPDATE.
CREATE OR REPLACE FUNCTION public.guard_agent_generation_lock_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.conversation_id::text,31));

 IF EXISTS(
  SELECT 1 FROM public.agent_customer_turns t
  WHERE t.conversation_id=NEW.conversation_id
    AND t.state IN ('processing_safe','processing')
 ) THEN
  RAISE EXCEPTION 'cannot acquire generation lock while customer turn owns conversation %',NEW.conversation_id
    USING ERRCODE='55000';
 END IF;

 IF EXISTS(
  SELECT 1 FROM public.welcome_funnel_execution_state f
  WHERE f.conversation_id=NEW.conversation_id
    AND f.status='running'
 ) THEN
  RAISE EXCEPTION 'cannot acquire generation lock while Welcome Funnel owns conversation %',NEW.conversation_id
    USING ERRCODE='55000';
 END IF;

 RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.guard_agent_generation_lock_insert() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_agent_generation_lock_insert() TO service_role;
