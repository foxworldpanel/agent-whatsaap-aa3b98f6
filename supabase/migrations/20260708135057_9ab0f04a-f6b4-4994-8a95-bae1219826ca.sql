
ALTER TABLE public.blast_contacts ADD COLUMN IF NOT EXISTS parts_sent integer NOT NULL DEFAULT 0;

UPDATE public.blast_contacts
   SET status = 'enviado_abertura',
       last_sent_at = COALESCE(last_sent_at, now()),
       parts_sent = 3,
       updated_at = now()
 WHERE id = '8b70a8b5-925f-430c-a4ff-b47814643bf5';
