DELETE FROM public.messages WHERE conversation_id = 'd12339aa-0891-4492-9757-d785f7b0244f';
UPDATE public.conversations SET 
  agent_enabled = true
WHERE id = 'd12339aa-0891-4492-9757-d785f7b0244f';