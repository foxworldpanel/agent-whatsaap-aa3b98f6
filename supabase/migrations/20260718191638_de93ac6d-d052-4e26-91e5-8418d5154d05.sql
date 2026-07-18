GRANT DELETE ON public.messages TO authenticated, service_role;
GRANT DELETE ON public.conversations TO authenticated, service_role;

DELETE FROM public.messages WHERE conversation_id = 'fd475562-2a83-45af-a294-b9e87a634dca';
DELETE FROM public.conversations WHERE id = 'fd475562-2a83-45af-a294-b9e87a634dca';