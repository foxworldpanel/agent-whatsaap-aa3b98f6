ALTER TABLE public.blast_contacts DROP CONSTRAINT IF EXISTS blast_contacts_status_check;
ALTER TABLE public.blast_contacts ADD CONSTRAINT blast_contacts_status_check
  CHECK (status = ANY (ARRAY[
    'pendente','enviando_opening','enviando_d3','enviando_d7',
    'enviado_abertura','enviado_d3','enviado_d7',
    'respondeu','pulado','convertido','erro'
  ]));