-- Corrige a identidade canônica da conversa usada pelo webhook:
-- uma conversa por (user_id, contact_id).

CREATE UNIQUE INDEX IF NOT EXISTS conversations_one_per_contact
  ON public.conversations (user_id, contact_id);

-- Reassocia o contato/conversa do número pessoal de teste ao workspace/número
-- que já estiver associado ao registro de contato atual. O runtime fará a mesma
-- atualização automaticamente em toda nova mensagem.
UPDATE public.conversations AS c
SET
  workspace_id = ct.workspace_id,
  whatsapp_number_id = ct.whatsapp_number_id,
  agent_enabled = true,
  needs_review = false,
  review_reason = NULL,
  auto_paused_at = NULL
FROM public.contacts AS ct
WHERE c.user_id = ct.user_id
  AND c.contact_id = ct.id
  AND regexp_replace(ct.telefone, '\D', '', 'g') IN ('5511970116430', '11970116430');
