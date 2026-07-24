-- Agent V3: semântica final dos toggles.
-- 1) Toda conversa normal nasce com toggle individual ligado.
-- 2) O toggle global em agent_config funciona como master switch no runtime.
-- 3) Conversas bloqueadas/opt-out não são reativadas por esta migration.

ALTER TABLE public.conversations
  ALTER COLUMN agent_enabled SET DEFAULT true;

CREATE OR REPLACE FUNCTION public.conversations_default_agent_enabled()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- O estado individual começa ligado. A chave global é avaliada separadamente
  -- no webhook e não precisa ser copiada para cada linha de conversa.
  IF NEW.agent_enabled IS NULL THEN
    NEW.agent_enabled := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conversations_default_agent_enabled ON public.conversations;
CREATE TRIGGER trg_conversations_default_agent_enabled
  BEFORE INSERT ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.conversations_default_agent_enabled();

-- Ativa as conversas existentes que não estão explicitamente bloqueadas/revisão.
UPDATE public.conversations AS c
SET agent_enabled = true
WHERE COALESCE(c.needs_review, false) = false
  AND NOT EXISTS (
    SELECT 1
    FROM public.contacts ct
    WHERE ct.id = c.contact_id
      AND ct.status = 'bloqueado'
  );
