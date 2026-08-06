CREATE TABLE IF NOT EXISTS public.funnel_debug_trace (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  msg_id TEXT NOT NULL,
  phone TEXT,
  step TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.funnel_debug_trace TO authenticated;
GRANT ALL ON public.funnel_debug_trace TO service_role;
GRANT SELECT ON public.funnel_debug_trace TO anon;

ALTER TABLE public.funnel_debug_trace ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated inserts" ON public.funnel_debug_trace FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow service_role full access" ON public.funnel_debug_trace FOR ALL TO service_role USING (true);
CREATE POLICY "Allow public select" ON public.funnel_debug_trace FOR SELECT TO authenticated, anon USING (true);

CREATE INDEX IF NOT EXISTS idx_funnel_debug_trace_msg_id ON public.funnel_debug_trace (msg_id);
CREATE INDEX IF NOT EXISTS idx_funnel_debug_trace_phone ON public.funnel_debug_trace (phone, created_at DESC);
