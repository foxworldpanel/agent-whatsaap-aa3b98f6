CREATE TABLE public.agent_generation_locks (
  conversation_id uuid PRIMARY KEY,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  holder text
);
GRANT ALL ON public.agent_generation_locks TO service_role;
ALTER TABLE public.agent_generation_locks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service only" ON public.agent_generation_locks FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_agent_gen_locks_acquired_at ON public.agent_generation_locks (acquired_at);