CREATE OR REPLACE FUNCTION public.conversations_default_agent_enabled()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  -- Default: agente ligado em toda conversa nova.
  NEW.agent_enabled := true;
  RETURN NEW;
END;
$function$;