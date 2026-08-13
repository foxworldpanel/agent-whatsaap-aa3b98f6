CREATE TABLE IF NOT EXISTS public.agent_execution_traces (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    trace_id text NOT NULL,
    message_id text,
    conversation_id text,
    phone text,
    step text NOT NULL,
    status text,
    details jsonb DEFAULT '{}'::jsonb,
    duration_ms integer,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_execution_traces_trace_id ON public.agent_execution_traces(trace_id);
CREATE INDEX IF NOT EXISTS idx_agent_execution_traces_conversation_id ON public.agent_execution_traces(conversation_id);

GRANT SELECT, INSERT ON public.agent_execution_traces TO authenticated;
GRANT SELECT, INSERT ON public.agent_execution_traces TO anon;
GRANT ALL ON public.agent_execution_traces TO service_role;

ALTER TABLE public.agent_execution_traces ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agent_execution_traces' AND policyname = 'Allow all for authenticated') THEN
        CREATE POLICY "Allow all for authenticated" ON public.agent_execution_traces FOR ALL TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agent_execution_traces' AND policyname = 'Allow anonymous insert') THEN
        CREATE POLICY "Allow anonymous insert" ON public.agent_execution_traces FOR INSERT TO anon WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agent_execution_traces' AND policyname = 'Allow anonymous select') THEN
        CREATE POLICY "Allow anonymous select" ON public.agent_execution_traces FOR SELECT TO anon USING (true);
    END IF;
END $$;
