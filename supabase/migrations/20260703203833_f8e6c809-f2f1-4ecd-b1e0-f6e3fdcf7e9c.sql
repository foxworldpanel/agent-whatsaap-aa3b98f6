ALTER TABLE public.conversations ALTER COLUMN agent_enabled SET DEFAULT false;

CREATE OR REPLACE FUNCTION public.conversations_default_agent_enabled()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  _phone text;
BEGIN
  SELECT telefone INTO _phone FROM public.contacts WHERE id = NEW.contact_id;
  IF _phone = '5511970116430' THEN
    NEW.agent_enabled := true;
  ELSE
    NEW.agent_enabled := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conversations_default_agent_enabled ON public.conversations;
CREATE TRIGGER trg_conversations_default_agent_enabled
  BEFORE INSERT ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.conversations_default_agent_enabled();