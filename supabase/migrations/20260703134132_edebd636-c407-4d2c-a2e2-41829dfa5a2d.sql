
CREATE OR REPLACE FUNCTION public.get_or_create_active_conversation(
  _user_id uuid,
  _contact_id uuid,
  _whatsapp_number_id uuid DEFAULT NULL::uuid,
  _initial_status conversation_status DEFAULT 'agente_respondendo'::conversation_status
)
RETURNS TABLE(
  id uuid,
  agent_enabled boolean,
  whatsapp_number_id uuid,
  needs_review boolean,
  contexto_extra text,
  last_media_sent jsonb,
  last_message_at timestamp with time zone,
  created_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _conv_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text || ':' || _contact_id::text || ':' || COALESCE(_whatsapp_number_id::text, 'legacy'), 0));

  IF _whatsapp_number_id IS NOT NULL THEN
    SELECT c.id INTO _conv_id
    FROM public.conversations c
    WHERE c.user_id = _user_id
      AND c.contact_id = _contact_id
      AND c.status IN ('agente_respondendo', 'aguardando')
      AND c.whatsapp_number_id = _whatsapp_number_id
    ORDER BY c.created_at ASC, c.id ASC
    LIMIT 1
    FOR UPDATE;
  ELSE
    SELECT c.id INTO _conv_id
    FROM public.conversations c
    WHERE c.user_id = _user_id
      AND c.contact_id = _contact_id
      AND c.status IN ('agente_respondendo', 'aguardando')
      AND c.whatsapp_number_id IS NULL
    ORDER BY c.created_at ASC, c.id ASC
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF _conv_id IS NULL THEN
    IF _whatsapp_number_id IS NOT NULL THEN
      INSERT INTO public.conversations AS conv (user_id, contact_id, status, whatsapp_number_id)
      VALUES (_user_id, _contact_id, _initial_status, _whatsapp_number_id)
      ON CONFLICT (user_id, contact_id, whatsapp_number_id)
        WHERE status IN ('agente_respondendo', 'aguardando') AND whatsapp_number_id IS NOT NULL
      DO UPDATE SET updated_at = now()
      RETURNING conv.id INTO _conv_id;
    ELSE
      INSERT INTO public.conversations AS conv (user_id, contact_id, status, whatsapp_number_id)
      VALUES (_user_id, _contact_id, _initial_status, NULL)
      ON CONFLICT (user_id, contact_id)
        WHERE status IN ('agente_respondendo', 'aguardando') AND whatsapp_number_id IS NULL
      DO UPDATE SET updated_at = now()
      RETURNING conv.id INTO _conv_id;
    END IF;
  END IF;

  RETURN QUERY
  SELECT c.id, c.agent_enabled, c.whatsapp_number_id, c.needs_review, c.contexto_extra, c.last_media_sent, c.last_message_at, c.created_at
  FROM public.conversations c
  WHERE c.id = _conv_id;
END;
$function$;
