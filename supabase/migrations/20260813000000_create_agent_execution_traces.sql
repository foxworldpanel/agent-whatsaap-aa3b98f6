CREATE TABLE public.agent_execution_traces (
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

CREATE INDEX idx_agent_execution_traces_trace_id ON public.agent_execution_traces(trace_id);
CREATE INDEX idx_agent_execution_traces_conversation_id ON public.agent_execution_traces(conversation_id);

GRANT SELECT, INSERT ON public.agent_execution_traces TO authenticated;
GRANT SELECT, INSERT ON public.agent_execution_traces TO anon;
GRANT ALL ON public.agent_execution_traces TO service_role;

ALTER TABLE public.agent_execution_traces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON public.agent_execution_traces FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow anonymous insert" ON public.agent_execution_traces FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anonymous select" ON public.agent_execution_traces FOR SELECT TO anon USING (true);
