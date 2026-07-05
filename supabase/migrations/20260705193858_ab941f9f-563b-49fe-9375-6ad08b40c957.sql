CREATE OR REPLACE FUNCTION public.set_default_workspace_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  ws uuid;
  wn_col_present boolean;
  conv_col_present boolean;
  wn_id uuid;
  conv_id uuid;
BEGIN
  IF NEW.workspace_id IS NULL AND NEW.user_id IS NOT NULL THEN
    ws := public.current_workspace_id();

    IF ws IS NULL THEN
      -- Try to derive from whatsapp_number_id column if this table has one
      SELECT EXISTS(
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name=TG_TABLE_NAME
          AND column_name='whatsapp_number_id'
      ) INTO wn_col_present;
      IF wn_col_present THEN
        EXECUTE format('SELECT ($1).%I', 'whatsapp_number_id') INTO wn_id USING NEW;
        IF wn_id IS NOT NULL THEN
          SELECT workspace_id INTO ws FROM public.whatsapp_numbers WHERE id = wn_id LIMIT 1;
        END IF;
      END IF;
    END IF;

    IF ws IS NULL THEN
      -- Try to derive from conversation_id (messages)
      SELECT EXISTS(
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name=TG_TABLE_NAME
          AND column_name='conversation_id'
      ) INTO conv_col_present;
      IF conv_col_present THEN
        EXECUTE format('SELECT ($1).%I', 'conversation_id') INTO conv_id USING NEW;
        IF conv_id IS NOT NULL THEN
          SELECT workspace_id INTO ws FROM public.conversations WHERE id = conv_id LIMIT 1;
        END IF;
      END IF;
    END IF;

    IF ws IS NULL THEN
      SELECT id INTO ws FROM public.workspaces
        WHERE user_id = NEW.user_id AND is_default = true LIMIT 1;
    END IF;

    NEW.workspace_id := ws;
  END IF;
  RETURN NEW;
END;
$function$;