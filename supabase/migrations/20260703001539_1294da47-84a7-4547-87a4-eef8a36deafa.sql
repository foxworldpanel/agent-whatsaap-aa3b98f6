-- 1) Remove mensagens duplicadas por external_id que ficariam repetidas após a mesclagem.
WITH active_convs AS (
  SELECT
    c.*,
    FIRST_VALUE(c.id) OVER (
      PARTITION BY c.user_id, c.contact_id, c.whatsapp_number_id
      ORDER BY c.created_at ASC, c.id ASC
    ) AS keep_id,
    COUNT(*) OVER (PARTITION BY c.user_id, c.contact_id, c.whatsapp_number_id) AS group_count
  FROM public.conversations c
  WHERE c.status IN ('agente_respondendo', 'aguardando')
), mapped_messages AS (
  SELECT
    m.id,
    m.conversation_id,
    ac.keep_id,
    m.external_id,
    ROW_NUMBER() OVER (
      PARTITION BY ac.keep_id, m.external_id
      ORDER BY
        CASE WHEN m.conversation_id = ac.keep_id THEN 0 ELSE 1 END,
        m.created_at ASC NULLS LAST,
        m.id ASC
    ) AS rn
  FROM public.messages m
  JOIN active_convs ac ON ac.id = m.conversation_id
  WHERE ac.group_count > 1
    AND m.external_id IS NOT NULL
)
DELETE FROM public.messages m
USING mapped_messages mm
WHERE m.id = mm.id
  AND mm.rn > 1;

-- 2) Mescla TODAS as conversas ativas duplicadas por usuário + contato + número,
-- incluindo legadas com whatsapp_number_id nulo.
WITH ranked AS (
  SELECT
    c.id,
    FIRST_VALUE(c.id) OVER (
      PARTITION BY c.user_id, c.contact_id, c.whatsapp_number_id
      ORDER BY c.created_at ASC, c.id ASC
    ) AS keep_id,
    ROW_NUMBER() OVER (
      PARTITION BY c.user_id, c.contact_id, c.whatsapp_number_id
      ORDER BY c.created_at ASC, c.id ASC
    ) AS rn
  FROM public.conversations c
  WHERE c.status IN ('agente_respondendo', 'aguardando')
), dupes AS (
  SELECT id, keep_id FROM ranked WHERE rn > 1
)
UPDATE public.messages m
SET conversation_id = d.keep_id
FROM dupes d
WHERE m.conversation_id = d.id;

WITH ranked AS (
  SELECT
    c.id,
    FIRST_VALUE(c.id) OVER (
      PARTITION BY c.user_id, c.contact_id, c.whatsapp_number_id
      ORDER BY c.created_at ASC, c.id ASC
    ) AS keep_id,
    ROW_NUMBER() OVER (
      PARTITION BY c.user_id, c.contact_id, c.whatsapp_number_id
      ORDER BY c.created_at ASC, c.id ASC
    ) AS rn
  FROM public.conversations c
  WHERE c.status IN ('agente_respondendo', 'aguardando')
), dupes AS (
  SELECT id, keep_id FROM ranked WHERE rn > 1
)
UPDATE public.agent_logs l
SET conversation_id = d.keep_id
FROM dupes d
WHERE l.conversation_id = d.id;

WITH ranked AS (
  SELECT
    c.id,
    FIRST_VALUE(c.id) OVER (
      PARTITION BY c.user_id, c.contact_id, c.whatsapp_number_id
      ORDER BY c.created_at ASC, c.id ASC
    ) AS keep_id,
    ROW_NUMBER() OVER (
      PARTITION BY c.user_id, c.contact_id, c.whatsapp_number_id
      ORDER BY c.created_at ASC, c.id ASC
    ) AS rn
  FROM public.conversations c
  WHERE c.status IN ('agente_respondendo', 'aguardando')
), dupes AS (
  SELECT id, keep_id FROM ranked WHERE rn > 1
)
UPDATE public.free_trials f
SET conversation_id = d.keep_id
FROM dupes d
WHERE f.conversation_id = d.id;

WITH ranked AS (
  SELECT
    c.id,
    FIRST_VALUE(c.id) OVER (
      PARTITION BY c.user_id, c.contact_id, c.whatsapp_number_id
      ORDER BY c.created_at ASC, c.id ASC
    ) AS keep_id,
    ROW_NUMBER() OVER (
      PARTITION BY c.user_id, c.contact_id, c.whatsapp_number_id
      ORDER BY c.created_at ASC, c.id ASC
    ) AS rn
  FROM public.conversations c
  WHERE c.status IN ('agente_respondendo', 'aguardando')
), dupes AS (
  SELECT id, keep_id FROM ranked WHERE rn > 1
), msg_rollup AS (
  SELECT
    d.keep_id AS id,
    (ARRAY_AGG(m.body ORDER BY m.created_at DESC NULLS LAST, m.id DESC))[1] AS last_message_preview,
    MAX(m.created_at) AS last_message_at
  FROM dupes d
  JOIN public.messages m ON m.conversation_id = d.keep_id
  GROUP BY d.keep_id
), conv_rollup AS (
  SELECT
    d.keep_id AS id,
    BOOL_OR(c.agent_enabled) AS agent_enabled,
    BOOL_OR(c.needs_review) AS needs_review,
    (ARRAY_AGG(c.review_reason ORDER BY c.updated_at DESC NULLS LAST) FILTER (WHERE c.review_reason IS NOT NULL))[1] AS review_reason,
    (ARRAY_AGG(c.contexto_extra ORDER BY c.updated_at DESC NULLS LAST) FILTER (WHERE c.contexto_extra IS NOT NULL))[1] AS contexto_extra,
    (ARRAY_AGG(c.last_media_sent ORDER BY c.updated_at DESC NULLS LAST) FILTER (WHERE c.last_media_sent IS NOT NULL))[1] AS last_media_sent,
    CASE
      WHEN BOOL_OR(c.funnel_status = 'running') THEN 'running'::public.funnel_status
      WHEN BOOL_OR(c.funnel_status = 'completed') THEN 'completed'::public.funnel_status
      ELSE 'not_started'::public.funnel_status
    END AS funnel_status
  FROM dupes d
  JOIN public.conversations c ON c.id IN (d.id, d.keep_id)
  GROUP BY d.keep_id
)
UPDATE public.conversations c
SET
  last_message_preview = NULLIF(LEFT(COALESCE(m.last_message_preview, c.last_message_preview, ''), 120), ''),
  last_message_at = COALESCE(m.last_message_at, c.last_message_at),
  agent_enabled = COALESCE(r.agent_enabled, c.agent_enabled),
  needs_review = COALESCE(r.needs_review, c.needs_review),
  review_reason = COALESCE(r.review_reason, c.review_reason),
  contexto_extra = COALESCE(r.contexto_extra, c.contexto_extra),
  last_media_sent = COALESCE(r.last_media_sent, c.last_media_sent),
  funnel_status = COALESCE(r.funnel_status, c.funnel_status),
  updated_at = now()
FROM conv_rollup r
LEFT JOIN msg_rollup m ON m.id = r.id
WHERE c.id = r.id;

WITH ranked AS (
  SELECT
    c.id,
    ROW_NUMBER() OVER (
      PARTITION BY c.user_id, c.contact_id, c.whatsapp_number_id
      ORDER BY c.created_at ASC, c.id ASC
    ) AS rn
  FROM public.conversations c
  WHERE c.status IN ('agente_respondendo', 'aguardando')
)
DELETE FROM public.conversations c
USING ranked r
WHERE c.id = r.id
  AND r.rn > 1;

-- 3) Travas definitivas contra duplicação por concorrência.
CREATE UNIQUE INDEX IF NOT EXISTS conversations_one_active_per_contact_number_idx
ON public.conversations (user_id, contact_id, whatsapp_number_id)
WHERE status IN ('agente_respondendo', 'aguardando')
  AND whatsapp_number_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS conversations_one_active_legacy_contact_idx
ON public.conversations (user_id, contact_id)
WHERE status IN ('agente_respondendo', 'aguardando')
  AND whatsapp_number_id IS NULL;

-- 4) Função idempotente usada pelo webhook/dispatcher para buscar ou criar conversa ativa.
CREATE OR REPLACE FUNCTION public.get_or_create_active_conversation(
  _user_id uuid,
  _contact_id uuid,
  _whatsapp_number_id uuid DEFAULT NULL,
  _initial_status public.conversation_status DEFAULT 'agente_respondendo'
)
RETURNS TABLE (
  id uuid,
  agent_enabled boolean,
  whatsapp_number_id uuid,
  needs_review boolean,
  contexto_extra text,
  last_media_sent jsonb,
  last_message_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _conv_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text || ':' || _contact_id::text || ':' || COALESCE(_whatsapp_number_id::text, 'legacy'), 0));

  IF _whatsapp_number_id IS NOT NULL THEN
    SELECT c.id
      INTO _conv_id
    FROM public.conversations c
    WHERE c.user_id = _user_id
      AND c.contact_id = _contact_id
      AND c.status IN ('agente_respondendo', 'aguardando')
      AND (c.whatsapp_number_id = _whatsapp_number_id OR c.whatsapp_number_id IS NULL)
    ORDER BY
      CASE WHEN c.whatsapp_number_id = _whatsapp_number_id THEN 0 ELSE 1 END,
      c.created_at ASC,
      c.id ASC
    LIMIT 1
    FOR UPDATE;
  ELSE
    SELECT c.id
      INTO _conv_id
    FROM public.conversations c
    WHERE c.user_id = _user_id
      AND c.contact_id = _contact_id
      AND c.status IN ('agente_respondendo', 'aguardando')
      AND c.whatsapp_number_id IS NULL
    ORDER BY c.created_at ASC, c.id ASC
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF _conv_id IS NOT NULL THEN
    IF _whatsapp_number_id IS NOT NULL THEN
      UPDATE public.conversations c
      SET whatsapp_number_id = COALESCE(c.whatsapp_number_id, _whatsapp_number_id), updated_at = now()
      WHERE c.id = _conv_id;
    END IF;
  ELSE
    IF _whatsapp_number_id IS NOT NULL THEN
      INSERT INTO public.conversations (user_id, contact_id, status, whatsapp_number_id)
      VALUES (_user_id, _contact_id, _initial_status, _whatsapp_number_id)
      ON CONFLICT (user_id, contact_id, whatsapp_number_id)
        WHERE status IN ('agente_respondendo', 'aguardando') AND whatsapp_number_id IS NOT NULL
      DO UPDATE SET updated_at = now()
      RETURNING conversations.id INTO _conv_id;
    ELSE
      INSERT INTO public.conversations (user_id, contact_id, status, whatsapp_number_id)
      VALUES (_user_id, _contact_id, _initial_status, NULL)
      ON CONFLICT (user_id, contact_id)
        WHERE status IN ('agente_respondendo', 'aguardando') AND whatsapp_number_id IS NULL
      DO UPDATE SET updated_at = now()
      RETURNING conversations.id INTO _conv_id;
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.agent_enabled,
    c.whatsapp_number_id,
    c.needs_review,
    c.contexto_extra,
    c.last_media_sent,
    c.last_message_at,
    c.created_at
  FROM public.conversations c
  WHERE c.id = _conv_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_active_conversation(uuid, uuid, uuid, public.conversation_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_active_conversation(uuid, uuid, uuid, public.conversation_status) TO service_role;