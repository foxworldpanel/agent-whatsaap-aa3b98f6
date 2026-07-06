-- Switch RLS-helper functions from SECURITY DEFINER to SECURITY INVOKER.
-- They only read data the caller can already see through existing RLS
-- (workspaces owned by auth.uid()) or request headers, so elevated
-- privileges are unnecessary.

CREATE OR REPLACE FUNCTION public.user_owns_workspace(_workspace_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.workspaces
    WHERE id = _workspace_id AND user_id = auth.uid()
  )
$function$;

CREATE OR REPLACE FUNCTION public.current_workspace_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
DECLARE
  hdrs text;
  raw text;
BEGIN
  BEGIN
    hdrs := current_setting('request.headers', true);
  EXCEPTION WHEN others THEN
    hdrs := NULL;
  END;
  IF hdrs IS NULL OR hdrs = '' THEN
    RETURN NULL;
  END IF;
  BEGIN
    raw := (hdrs::json ->> 'x-workspace-id');
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  IF raw IS NULL OR raw = '' THEN
    RETURN NULL;
  END IF;
  BEGIN
    RETURN raw::uuid;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.effective_workspace_id(_user_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    public.current_workspace_id(),
    (SELECT id FROM public.workspaces WHERE user_id = _user_id AND is_default = true LIMIT 1)
  );
$function$;