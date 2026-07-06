-- 0) Mapa dup → canônica em tabela temporária (uma vez só).
CREATE TEMP TABLE _conv_map ON COMMIT DROP AS
WITH canonical AS (
  SELECT DISTINCT ON (user_id, contact_id)
    id AS canonical_id, user_id, contact_id
  FROM public.conversations
  ORDER BY user_id, contact_id, created_at ASC, id ASC
)
SELECT c.id AS dup_id, k.canonical_id
FROM public.conversations c
JOIN canonical k ON k.user_id = c.user_id AND k.contact_id = c.contact_id
WHERE c.id <> k.canonical_id;

-- 1) Deduplica messages por (canonical_id, external_id): apaga as cópias das
--    duplicadas quando o mesmo external_id JÁ existe na canônica, OU quando
--    o mesmo external_id existe em duas duplicadas irmãs (mantém 1 por par).
DELETE FROM public.messages m
USING _conv_map d
WHERE m.conversation_id = d.dup_id
  AND m.external_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.messages c
    WHERE c.conversation_id = d.canonical_id
      AND c.external_id = m.external_id
  );

-- Dedup entre duplicadas irmãs (mesmo external_id em várias dupes → mantém a mais antiga).
DELETE FROM public.messages
WHERE id IN (
  SELECT m.id
  FROM public.messages m
  JOIN _conv_map d ON d.dup_id = m.conversation_id
  WHERE m.external_id IS NOT NULL
    AND m.id NOT IN (
      SELECT DISTINCT ON (d2.canonical_id, m2.external_id) m2.id
      FROM public.messages m2
      JOIN _conv_map d2 ON d2.dup_id = m2.conversation_id
      WHERE m2.external_id IS NOT NULL
      ORDER BY d2.canonical_id, m2.external_id, m2.created_at ASC, m2.id ASC
    )
);

-- 2) Reaponta mensagens restantes para a canônica.
UPDATE public.messages m
   SET conversation_id = d.canonical_id
  FROM _conv_map d
 WHERE m.conversation_id = d.dup_id;

-- 3) Reaponta agent_logs e free_trials.
UPDATE public.agent_logs a
   SET conversation_id = d.canonical_id
  FROM _conv_map d
 WHERE a.conversation_id = d.dup_id;

UPDATE public.free_trials f
   SET conversation_id = d.canonical_id
  FROM _conv_map d
 WHERE f.conversation_id = d.dup_id;

-- 4) Locks efêmeros: apaga os das duplicadas (~30s TTL, não vale reapontar).
DELETE FROM public.agent_generation_locks
 WHERE conversation_id IN (SELECT dup_id FROM _conv_map);

-- 5) Apaga as conversas duplicadas (todos os dados migrados).
DELETE FROM public.conversations
 WHERE id IN (SELECT dup_id FROM _conv_map);

-- 6) Impede novas duplicatas: uma única conversa ATIVA por (user_id, contact_id).
CREATE UNIQUE INDEX IF NOT EXISTS conversations_active_one_per_contact
  ON public.conversations (user_id, contact_id)
  WHERE status IN ('agente_respondendo', 'aguardando');

-- 7) RPC passa a chavear APENAS por (user_id, contact_id) — número vira metadado.
CREATE OR REPLACE FUNCTION public.get_or_create_active_conversation(
  _user_id uuid,
  _contact_id uuid,
  _whatsapp_number_id uuid DEFAULT NULL::uuid,
  _initial_status conversation_status DEFAULT 'agente_respondendo'::conversation_status
)
RETURNS TABLE(id uuid, agent_enabled boolean, whatsapp_number_id uuid, needs_review boolean, contexto_extra text, last_media_sent jsonb, last_message_at timestamp with time zone, created_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  _conv_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text || ':' || _contact_id::text, 0));

  SELECT c.id INTO _conv_id
  FROM public.conversations c
  WHERE c.user_id = _user_id
    AND c.contact_id = _contact_id
    AND c.status IN ('agente_respondendo', 'aguardando')
  ORDER BY c.created_at ASC, c.id ASC
  LIMIT 1
  FOR UPDATE;

  IF _conv_id IS NULL THEN
    INSERT INTO public.conversations (user_id, contact_id, status, whatsapp_number_id)
    VALUES (_user_id, _contact_id, _initial_status, _whatsapp_number_id)
    RETURNING conversations.id INTO _conv_id;
  ELSIF _whatsapp_number_id IS NOT NULL THEN
    UPDATE public.conversations
       SET whatsapp_number_id = _whatsapp_number_id, updated_at = now()
     WHERE id = _conv_id
       AND (whatsapp_number_id IS DISTINCT FROM _whatsapp_number_id);
  END IF;

  RETURN QUERY
  SELECT c.id, c.agent_enabled, c.whatsapp_number_id, c.needs_review, c.contexto_extra, c.last_media_sent, c.last_message_at, c.created_at
  FROM public.conversations c
  WHERE c.id = _conv_id;
END;
$function$;