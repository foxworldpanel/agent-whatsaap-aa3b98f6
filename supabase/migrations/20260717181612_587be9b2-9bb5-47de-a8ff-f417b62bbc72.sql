
-- Hardcode Mind ID in functions
CREATE OR REPLACE FUNCTION public.effective_workspace_id(_user_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa'::uuid;
$function$;

CREATE OR REPLACE FUNCTION public.user_owns_workspace(_workspace_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT _workspace_id = 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa'::uuid;
$function$;

-- Revoke public execution of security definer functions as per linter suggestion
REVOKE EXECUTE ON FUNCTION public.effective_workspace_id(uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.user_owns_workspace(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.effective_workspace_id(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_owns_workspace(uuid) TO authenticated, service_role;
