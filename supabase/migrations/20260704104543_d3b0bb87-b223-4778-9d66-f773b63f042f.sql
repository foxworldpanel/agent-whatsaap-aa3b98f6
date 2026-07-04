DELETE FROM public.messages WHERE conversation_id IN (SELECT id FROM public.conversations WHERE contact_id IN (SELECT id FROM public.contacts WHERE telefone = '5511970116430'));
DELETE FROM public.conversations WHERE contact_id IN (SELECT id FROM public.contacts WHERE telefone = '5511970116430');
DELETE FROM public.processed_messages WHERE message_id LIKE '%5511970116430%';