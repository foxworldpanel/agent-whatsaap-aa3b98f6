REVOKE ALL ON FUNCTION public.get_or_create_active_conversation(uuid, uuid, uuid, public.conversation_status) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_or_create_active_conversation(uuid, uuid, uuid, public.conversation_status) FROM anon;
REVOKE ALL ON FUNCTION public.get_or_create_active_conversation(uuid, uuid, uuid, public.conversation_status) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_active_conversation(uuid, uuid, uuid, public.conversation_status) TO service_role;