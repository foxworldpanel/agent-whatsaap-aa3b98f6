CREATE TABLE public.processed_messages (
  message_id TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.processed_messages TO authenticated;
GRANT ALL ON public.processed_messages TO service_role;
ALTER TABLE public.processed_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.processed_messages FOR ALL USING (false) WITH CHECK (false);
CREATE INDEX processed_messages_processed_at_idx ON public.processed_messages(processed_at);