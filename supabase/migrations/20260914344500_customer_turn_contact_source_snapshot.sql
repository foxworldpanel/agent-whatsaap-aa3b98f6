-- Contact source participates in Agent V3 behavior and therefore belongs to the
-- sealed Customer Turn semantic snapshot rather than mutable CRM state.
ALTER TABLE public.agent_customer_turn_messages
  ADD COLUMN IF NOT EXISTS contact_source text;

UPDATE public.agent_customer_turn_messages tm
SET contact_source=ct.source
FROM public.agent_inbound_jobs j
JOIN public.conversations c ON c.id=j.conversation_id
JOIN public.contacts ct ON ct.id=c.contact_id
WHERE tm.job_id=j.id AND tm.contact_source IS NULL;

CREATE OR REPLACE FUNCTION public.snapshot_agent_customer_turn_member()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_job public.agent_inbound_jobs%ROWTYPE; v_message record; v_conversation record; v_contact record; v_phone text;
BEGIN
 SELECT * INTO v_job FROM public.agent_inbound_jobs WHERE id=NEW.job_id;
 IF NOT FOUND OR v_job.message_id<>NEW.message_id THEN RAISE EXCEPTION 'Customer Turn member/job identity mismatch'; END IF;
 SELECT external_id,audio_url,conversation_id,workspace_id INTO v_message FROM public.messages WHERE id=NEW.message_id;
 IF NOT FOUND OR v_message.conversation_id IS DISTINCT FROM v_job.conversation_id OR v_message.workspace_id IS DISTINCT FROM v_job.workspace_id THEN RAISE EXCEPTION 'Customer Turn member source identity mismatch'; END IF;
 SELECT id,contact_id,whatsapp_number_id,user_id,workspace_id INTO v_conversation FROM public.conversations WHERE id=v_job.conversation_id;
 IF NOT FOUND OR v_conversation.workspace_id IS DISTINCT FROM v_job.workspace_id OR v_conversation.contact_id IS NULL OR v_conversation.whatsapp_number_id IS NULL OR v_conversation.user_id IS NULL THEN RAISE EXCEPTION 'Customer Turn member routing identity missing'; END IF;
 SELECT telefone,source INTO v_contact FROM public.contacts WHERE id=v_conversation.contact_id;
 v_phone:=regexp_replace(coalesce(v_contact.telefone,''),'\D','','g');
 IF nullif(v_phone,'') IS NULL THEN RAISE EXCEPTION 'Customer Turn member contact phone missing'; END IF;
 IF nullif(btrim(coalesce(v_message.external_id,'')),'') IS NULL OR nullif(btrim(coalesce(v_job.send_target,'')),'') IS NULL THEN RAISE EXCEPTION 'Customer Turn member execution identity missing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.agent_customer_turns t WHERE t.id=NEW.turn_id AND t.conversation_id=v_job.conversation_id AND t.workspace_id=v_job.workspace_id) THEN RAISE EXCEPTION 'Customer Turn member turn identity mismatch'; END IF;
 NEW.external_id:=v_message.external_id; NEW.input_text:=v_job.input_text; NEW.input_kind:=v_job.input_kind; NEW.input_mime:=v_job.input_mime; NEW.audio_url:=v_message.audio_url;
 NEW.send_target:=v_job.send_target; NEW.deferred_funnel:=v_job.deferred_funnel; NEW.user_id:=v_conversation.user_id; NEW.contact_id:=v_conversation.contact_id;
 NEW.whatsapp_number_id:=v_conversation.whatsapp_number_id; NEW.contact_phone:=v_phone; NEW.contact_source:=v_contact.source;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.guard_agent_customer_turn_member_snapshot_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.turn_id IS DISTINCT FROM OLD.turn_id OR NEW.job_id IS DISTINCT FROM OLD.job_id OR NEW.message_id IS DISTINCT FROM OLD.message_id OR NEW.ordinal IS DISTINCT FROM OLD.ordinal
 OR NEW.external_id IS DISTINCT FROM OLD.external_id OR NEW.input_text IS DISTINCT FROM OLD.input_text OR NEW.input_kind IS DISTINCT FROM OLD.input_kind OR NEW.input_mime IS DISTINCT FROM OLD.input_mime
 OR NEW.audio_url IS DISTINCT FROM OLD.audio_url OR NEW.send_target IS DISTINCT FROM OLD.send_target OR NEW.deferred_funnel IS DISTINCT FROM OLD.deferred_funnel
 OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.contact_id IS DISTINCT FROM OLD.contact_id OR NEW.whatsapp_number_id IS DISTINCT FROM OLD.whatsapp_number_id
 OR NEW.contact_phone IS DISTINCT FROM OLD.contact_phone OR NEW.contact_source IS DISTINCT FROM OLD.contact_source OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'Customer Turn member semantic snapshot is immutable'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.load_agent_customer_turn_members(p_turn_id uuid)
RETURNS TABLE(turn_id uuid,job_id uuid,message_id uuid,ordinal bigint,external_id text,input_text text,input_kind text,input_mime text,audio_url text,send_target text,deferred_funnel boolean,user_id uuid,contact_id uuid,whatsapp_number_id uuid,contact_phone text,contact_source text,resolved_text text,created_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT tm.turn_id,tm.job_id,tm.message_id,tm.ordinal,tm.external_id,tm.input_text,tm.input_kind,tm.input_mime,tm.audio_url,tm.send_target,tm.deferred_funnel,
        tm.user_id,tm.contact_id,tm.whatsapp_number_id,tm.contact_phone,tm.contact_source,tm.resolved_text,tm.created_at
 FROM public.agent_customer_turn_messages tm WHERE tm.turn_id=p_turn_id ORDER BY tm.ordinal;
$$;
