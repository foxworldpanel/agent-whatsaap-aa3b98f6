-- Direct Stage B transition helpers previously mutated ownership through REST
-- updates without the canonical conversation advisory fence. Move those state
-- changes into owner-checked RPCs sharing seed 31 with Customer Turns.
CREATE OR REPLACE FUNCTION public.release_agent_inbound_job_safe(p_message_id uuid,p_holder text,p_last_error text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_conversation_id uuid; v_changed uuid;
BEGIN
 SELECT conversation_id INTO v_conversation_id FROM public.agent_inbound_jobs WHERE message_id=p_message_id;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_conversation_id::text,31));
 UPDATE public.agent_inbound_jobs SET status='pending',claimed_by=NULL,claimed_at=NULL,last_error=p_last_error,updated_at=now()
 WHERE message_id=p_message_id AND conversation_id=v_conversation_id AND status='processing_safe' AND claimed_by=p_holder RETURNING id INTO v_changed;
 RETURN v_changed IS NOT NULL;
END $$;

CREATE OR REPLACE FUNCTION public.review_agent_inbound_job_safe(p_message_id uuid,p_holder text,p_last_error text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_conversation_id uuid; v_changed uuid;
BEGIN
 SELECT conversation_id INTO v_conversation_id FROM public.agent_inbound_jobs WHERE message_id=p_message_id;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_conversation_id::text,31));
 UPDATE public.agent_inbound_jobs SET status='needs_review',claimed_by=NULL,claimed_at=NULL,last_error=left(coalesce(p_last_error,''),1000),updated_at=now()
 WHERE message_id=p_message_id AND conversation_id=v_conversation_id AND status='processing_safe' AND claimed_by=p_holder RETURNING id INTO v_changed;
 RETURN v_changed IS NOT NULL;
END $$;

CREATE OR REPLACE FUNCTION public.complete_agent_inbound_job(p_message_id uuid,p_holder text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_conversation_id uuid; v_changed uuid;
BEGIN
 SELECT conversation_id INTO v_conversation_id FROM public.agent_inbound_jobs WHERE message_id=p_message_id;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_conversation_id::text,31));
 UPDATE public.agent_inbound_jobs SET status='processed',claimed_by=NULL,claimed_at=NULL,last_error=NULL,updated_at=now()
 WHERE message_id=p_message_id AND conversation_id=v_conversation_id AND status='processing' AND claimed_by=p_holder RETURNING id INTO v_changed;
 RETURN v_changed IS NOT NULL;
END $$;

CREATE OR REPLACE FUNCTION public.review_agent_inbound_job_runtime(p_message_id uuid,p_holder text,p_last_error text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_conversation_id uuid; v_changed uuid;
BEGIN
 SELECT conversation_id INTO v_conversation_id FROM public.agent_inbound_jobs WHERE message_id=p_message_id;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_conversation_id::text,31));
 UPDATE public.agent_inbound_jobs SET status='needs_review',claimed_by=NULL,claimed_at=NULL,last_error=left(coalesce(p_last_error,''),1000),updated_at=now()
 WHERE message_id=p_message_id AND conversation_id=v_conversation_id AND status='processing' AND claimed_by=p_holder RETURNING id INTO v_changed;
 RETURN v_changed IS NOT NULL;
END $$;

REVOKE ALL ON FUNCTION public.release_agent_inbound_job_safe(uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.review_agent_inbound_job_safe(uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.complete_agent_inbound_job(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.review_agent_inbound_job_runtime(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.release_agent_inbound_job_safe(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.review_agent_inbound_job_safe(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_agent_inbound_job(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.review_agent_inbound_job_runtime(uuid,text,text) TO service_role;
