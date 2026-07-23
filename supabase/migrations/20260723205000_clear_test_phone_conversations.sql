-- Limpeza consolidada do telefone usado em testes do Agent V3.
-- Remove somente dados de conversa/runtime; preserva o cadastro do contato.
DO $$
DECLARE
  phone_full text := '5511970116430';
  phone_local text := '11970116430';
BEGIN
  IF to_regclass('public.conversations_v3') IS NOT NULL THEN
    DELETE FROM public.conversations_v3
    WHERE regexp_replace(phone, '[^0-9]', '', 'g') IN (phone_full, phone_local);
  END IF;

  IF to_regclass('public.agent_generation_locks') IS NOT NULL
     AND to_regclass('public.conversations') IS NOT NULL
     AND to_regclass('public.contacts') IS NOT NULL THEN
    DELETE FROM public.agent_generation_locks
    WHERE conversation_id IN (
      SELECT c.id
      FROM public.conversations c
      JOIN public.contacts ct ON ct.id = c.contact_id
      WHERE regexp_replace(ct.telefone, '[^0-9]', '', 'g') IN (phone_full, phone_local)
    );
  END IF;

  IF to_regclass('public.agent_logs') IS NOT NULL
     AND to_regclass('public.conversations') IS NOT NULL
     AND to_regclass('public.contacts') IS NOT NULL THEN
    DELETE FROM public.agent_logs
    WHERE conversation_id IN (
      SELECT c.id
      FROM public.conversations c
      JOIN public.contacts ct ON ct.id = c.contact_id
      WHERE regexp_replace(ct.telefone, '[^0-9]', '', 'g') IN (phone_full, phone_local)
    );
  END IF;

  IF to_regclass('public.messages') IS NOT NULL
     AND to_regclass('public.conversations') IS NOT NULL
     AND to_regclass('public.contacts') IS NOT NULL THEN
    DELETE FROM public.messages
    WHERE conversation_id IN (
      SELECT c.id
      FROM public.conversations c
      JOIN public.contacts ct ON ct.id = c.contact_id
      WHERE regexp_replace(ct.telefone, '[^0-9]', '', 'g') IN (phone_full, phone_local)
    );
  END IF;

  IF to_regclass('public.conversations') IS NOT NULL
     AND to_regclass('public.contacts') IS NOT NULL THEN
    DELETE FROM public.conversations
    WHERE contact_id IN (
      SELECT id
      FROM public.contacts
      WHERE regexp_replace(telefone, '[^0-9]', '', 'g') IN (phone_full, phone_local)
    );
  END IF;

  IF to_regclass('public.processed_messages') IS NOT NULL THEN
    DELETE FROM public.processed_messages
    WHERE message_id LIKE '%' || phone_full || '%'
       OR message_id LIKE '%' || phone_local || '%';
  END IF;
END $$;
