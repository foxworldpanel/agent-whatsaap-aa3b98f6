ALTER PUBLICATION supabase_realtime ADD TABLE public.blast_contacts;
ALTER TABLE public.blast_contacts REPLICA IDENTITY FULL;