-- The membership ordinal is assigned durably while attachment is serialized by the
-- conversation fence. It is the canonical order inside a Customer Turn. Ordering
-- runtime input by messages.created_at plus a UUID tie-break can reorder messages
-- that share a timestamp, so always replay the durable membership sequence instead.

CREATE OR REPLACE FUNCTION public.load_agent_customer_turn_members(p_turn_id uuid)
RETURNS TABLE(turn_id uuid,job_id uuid,message_id uuid,ordinal bigint,external_id text,input_text text,input_kind text,input_mime text,audio_url text,resolved_text text,created_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT tm.turn_id,j.id,j.message_id,tm.ordinal,m.external_id,j.input_text,j.input_kind,j.input_mime,m.audio_url,tm.resolved_text,m.created_at
 FROM public.agent_customer_turn_messages tm
 JOIN public.agent_inbound_jobs j ON j.id=tm.job_id
 JOIN public.messages m ON m.id=tm.message_id
 WHERE tm.turn_id=p_turn_id
 ORDER BY tm.ordinal;
$$;

REVOKE ALL ON FUNCTION public.load_agent_customer_turn_members(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.load_agent_customer_turn_members(uuid) TO service_role;
