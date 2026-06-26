
CREATE TABLE public.extraction_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  whatsapp_number_id uuid REFERENCES public.whatsapp_numbers(id) ON DELETE SET NULL,
  total_found integer NOT NULL DEFAULT 0,
  new_imported integer NOT NULL DEFAULT 0,
  already_existed integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ok',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.extraction_logs TO authenticated;
GRANT ALL ON public.extraction_logs TO service_role;

ALTER TABLE public.extraction_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own extraction logs"
ON public.extraction_logs FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX extraction_logs_user_created_idx ON public.extraction_logs (user_id, created_at DESC);
