-- 0) Remove legacy active-only uniqueness before temporarily updating canonical rows.
DROP INDEX IF EXISTS public.conversations_active_one_per_contact;
DROP INDEX IF EXISTS public.conversations_one_active_legacy_contact_idx;
DROP INDEX IF EXISTS public.conversations_one_active_per_contact_number_idx;

-- 1) Build a duplicate -> canonical map for every user/contact pair.
CREATE TEMP TABLE _conv_map ON COMMIT DROP AS
WITH canonical AS (
  SELECT DISTINCT ON (user_id, contact_id)
    id AS canonical_id,
    user_id,
    contact_id
  FROM public.conversations
  ORDER BY user_id, contact_id, created_at ASC, id ASC
)
SELECT c.id AS dup_id, k.canonical_id
FROM public.conversations c
JOIN canonical k
  ON k.user_id = c.user_id
 AND k.contact_id = c.contact_id
WHERE c.id <> k.canonical_id;

-- 2) Preserve the most recent conversation-level state on the canonical row.
WITH latest AS (
  SELECT DISTINCT ON (k.canonical_id)
    k.canonical_id,
    c.status,
    c.last_message_preview,
    c.last_message_at,
    c.agent_enabled,
    c.whatsapp_number_id,
    c.needs_review,
    c.review_reason,
    c.auto_paused_at,
    c.internal_note,
    c.funnel_status,
    c.contexto_extra,
    c.last_media_sent,
    c.workspace_id
  FROM (
    SELECT canonical_id, canonical_id AS conv_id FROM _conv_map
    UNION
    SELECT canonical_id, dup_id AS conv_id FROM _conv_map
  ) k
  JOIN public.conversations c ON c.id = k.conv_id
  ORDER BY k.canonical_id, COALESCE(c.last_message_at, c.updated_at, c.created_at) DESC, c.created_at DESC, c.id DESC
)
UPDATE public.conversations c
   SET status = latest.status,
       last_message_preview = COALESCE(latest.last_message_preview, c.last_message_preview),
       last_message_at = GREATEST(COALESCE(c.last_message_at, '-infinity'::timestamptz), COALESCE(latest.last_message_at, '-infinity'::timestamptz)),
       agent_enabled = latest.agent_enabled,
       whatsapp_number_id = COALESCE(latest.whatsapp_number_id, c.whatsapp_number_id),
       needs_review = latest.needs_review,
       review_reason = latest.review_reason,
       auto_paused_at = latest.auto_paused_at,
       internal_note = COALESCE(latest.internal_note, c.internal_note),
       funnel_status = latest.funnel_status,
       contexto_extra = COALESCE(latest.contexto_extra, c.contexto_extra),
       last_media_sent = COALESCE(latest.last_media_sent, c.last_media_sent),
       workspace_id = COALESCE(latest.workspace_id, c.workspace_id),
       updated_at = now()
  FROM latest
 WHERE c.id = latest.canonical_id;

-- 3) Remove exact duplicated message copies by external id before moving messages.
DELETE FROM public.messages m
USING _conv_map d
WHERE m.conversation_id = d.dup_id
  AND m.external_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.messages c
    WHERE c.conversation_id = d.canonical_id
      AND c.external_id = m.external_id
  );

DELETE FROM public.messages
WHERE id IN (
  SELECT id
  FROM (
    SELECT m.id,
           row_number() OVER (
             PARTITION BY d.canonical_id, m.external_id
             ORDER BY m.created_at ASC, m.id ASC
           ) AS rn
    FROM public.messages m
    JOIN _conv_map d ON d.dup_id = m.conversation_id
    WHERE m.external_id IS NOT NULL
  ) ranked
  WHERE ranked.rn > 1
);

-- 4) Move all child records to the canonical conversation.
UPDATE public.messages m
   SET conversation_id = d.canonical_id
  FROM _conv_map d
 WHERE m.conversation_id = d.dup_id;

UPDATE public.agent_logs a
   SET conversation_id = d.canonical_id
  FROM _conv_map d
 WHERE a.conversation_id = d.dup_id;

UPDATE public.free_trials f
   SET conversation_id = d.canonical_id
  FROM _conv_map d
 WHERE f.conversation_id = d.dup_id;

-- Locks are short-lived; dropping duplicate locks avoids primary-key collisions.
DELETE FROM public.agent_generation_locks
 WHERE conversation_id IN (SELECT dup_id FROM _conv_map);

-- 5) Remove duplicate conversation shells after all data was moved.
DELETE FROM public.conversations
 WHERE id IN (SELECT dup_id FROM _conv_map);

-- 6) Strict one-conversation-per-contact uniqueness, covering all statuses.
CREATE UNIQUE INDEX IF NOT EXISTS conversations_one_per_contact
  ON public.conversations (user_id, contact_id);

-- 7) Reuse the contact's existing conversation regardless of status.
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
  ORDER BY c.created_at ASC, c.id ASC
  LIMIT 1
  FOR UPDATE;

  IF _conv_id IS NULL THEN
    INSERT INTO public.conversations (user_id, contact_id, status, whatsapp_number_id)
    VALUES (_user_id, _contact_id, _initial_status, _whatsapp_number_id)
    RETURNING conversations.id INTO _conv_id;
  ELSE
    UPDATE public.conversations
       SET status = CASE
             WHEN status IN ('convertido', 'encerrada') THEN _initial_status
             ELSE status
           END,
           whatsapp_number_id = COALESCE(_whatsapp_number_id, whatsapp_number_id),
           updated_at = now()
     WHERE id = _conv_id;
  END IF;

  RETURN QUERY
  SELECT c.id, c.agent_enabled, c.whatsapp_number_id, c.needs_review, c.contexto_extra, c.last_media_sent, c.created_at, c.last_message_at
  FROM public.conversations c
  WHERE c.id = _conv_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_or_create_active_conversation(uuid, uuid, uuid, public.conversation_status) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_active_conversation(uuid, uuid, uuid, public.conversation_status) TO service_role;