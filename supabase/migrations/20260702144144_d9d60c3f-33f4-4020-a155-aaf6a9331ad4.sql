
ALTER TABLE public.blast_contacts
  ADD COLUMN IF NOT EXISTS sent_via_number_id uuid REFERENCES public.whatsapp_numbers(id) ON DELETE SET NULL;

ALTER TABLE public.blast_logs
  ADD COLUMN IF NOT EXISTS sent_via_number_id uuid REFERENCES public.whatsapp_numbers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_blast_contacts_sent_via_number ON public.blast_contacts(sent_via_number_id);
CREATE INDEX IF NOT EXISTS idx_blast_logs_sent_via_number ON public.blast_logs(sent_via_number_id);
