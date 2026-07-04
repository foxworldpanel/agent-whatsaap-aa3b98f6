
DELETE FROM public.messages WHERE conversation_id IN (
  SELECT id FROM public.conversations WHERE contact_id IN (
    SELECT id FROM public.contacts WHERE telefone ~ '.*11970116430.*'
  )
);
DELETE FROM public.conversations WHERE contact_id IN (
  SELECT id FROM public.contacts WHERE telefone ~ '.*11970116430.*'
);
DELETE FROM public.agent_logs WHERE phone ~ '.*11970116430.*';
DELETE FROM public.blast_contacts WHERE telefone ~ '.*11970116430.*';
DELETE FROM public.contacts WHERE telefone ~ '.*11970116430.*';
