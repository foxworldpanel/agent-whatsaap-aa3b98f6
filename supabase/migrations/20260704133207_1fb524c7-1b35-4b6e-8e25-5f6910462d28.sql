DELETE FROM public.processed_messages WHERE message_id IN (
  SELECT external_id FROM public.messages
  WHERE external_id IS NOT NULL
    AND conversation_id IN (
      SELECT id FROM public.conversations
      WHERE contact_id IN ('218f0acb-de99-47ad-b41a-aba2524976ba','9d5c4a7a-0064-4b06-a249-0f8e108df185')
    )
);
DELETE FROM public.messages WHERE conversation_id IN (
  SELECT id FROM public.conversations
  WHERE contact_id IN ('218f0acb-de99-47ad-b41a-aba2524976ba','9d5c4a7a-0064-4b06-a249-0f8e108df185')
);
DELETE FROM public.conversations
  WHERE contact_id IN ('218f0acb-de99-47ad-b41a-aba2524976ba','9d5c4a7a-0064-4b06-a249-0f8e108df185');