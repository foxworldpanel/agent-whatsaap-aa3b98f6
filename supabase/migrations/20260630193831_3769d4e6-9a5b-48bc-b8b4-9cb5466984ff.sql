ALTER TABLE public.blast_contacts
  ADD COLUMN IF NOT EXISTS prioridade integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultima_interacao date;

CREATE INDEX IF NOT EXISTS idx_blast_contacts_queue
  ON public.blast_contacts (campaign_id, status, prioridade DESC, created_at ASC);