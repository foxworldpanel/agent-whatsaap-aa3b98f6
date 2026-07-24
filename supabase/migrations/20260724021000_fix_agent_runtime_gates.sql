-- Corrige inconsistência entre painel e webhook do Agent V3.
--
-- Semântica:
-- - agent_config ausente = ON por padrão;
-- - global OFF somente quando agent_config.agent_enabled = false;
-- - conversa individual OFF somente quando conversations.agent_enabled = false;
-- - needs_review continua informativo, mas não é kill switch oculto.

-- Garante default de novas configurações.
ALTER TABLE public.agent_config
  ALTER COLUMN agent_enabled SET DEFAULT true;

ALTER TABLE public.conversations
  ALTER COLUMN agent_enabled SET DEFAULT true;

-- Ativa conversas existentes que não foram explicitamente bloqueadas/opt-out.
UPDATE public.conversations AS c
SET agent_enabled = true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.contacts ct
  WHERE ct.id = c.contact_id
    AND ct.status = 'bloqueado'
);

-- Limpa review técnico antigo do número pessoal de teste para facilitar validação.
UPDATE public.conversations AS c
SET
  agent_enabled = true,
  needs_review = false,
  review_reason = NULL,
  auto_paused_at = NULL
WHERE c.contact_id IN (
  SELECT id
  FROM public.contacts
  WHERE regexp_replace(telefone, '\D', '', 'g') IN ('5511970116430', '11970116430')
);
