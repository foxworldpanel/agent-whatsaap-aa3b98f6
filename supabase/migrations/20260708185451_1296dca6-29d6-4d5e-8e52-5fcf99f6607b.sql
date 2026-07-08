ALTER TABLE public.blast_contacts_categoria_backup_20260708 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.blast_contacts_categoria_backup_20260708 FROM anon, authenticated;
GRANT ALL ON public.blast_contacts_categoria_backup_20260708 TO service_role;