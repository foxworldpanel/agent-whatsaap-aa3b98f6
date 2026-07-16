REVOKE EXECUTE ON FUNCTION public.get_or_create_active_conversation(uuid, uuid, uuid, conversation_status, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_or_create_active_conversation(uuid, uuid, uuid, conversation_status, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_or_create_active_conversation(uuid, uuid, uuid, conversation_status, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_active_conversation(uuid, uuid, uuid, conversation_status, uuid) TO service_role;