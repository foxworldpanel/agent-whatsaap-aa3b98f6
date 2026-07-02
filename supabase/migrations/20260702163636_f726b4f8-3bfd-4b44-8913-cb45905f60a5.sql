ALTER TABLE public.blast_campaigns
ADD COLUMN IF NOT EXISTS categoria_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];