UPDATE public.conversations SET agent_enabled = false;
ALTER TABLE public.conversations ALTER COLUMN agent_enabled SET DEFAULT false;