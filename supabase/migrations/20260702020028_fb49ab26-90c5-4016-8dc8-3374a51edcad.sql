
ALTER TABLE public.blast_contacts
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS error_message TEXT;

CREATE INDEX IF NOT EXISTS blast_contacts_list_status_idx
  ON public.blast_contacts(contact_list_id, status);
