-- Migration to support Playground V3
-- Create tables for independent test sessions
CREATE TABLE IF NOT EXISTS public.agent_playground_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    enabled_modules TEXT[] DEFAULT '{}',
    input_kind TEXT DEFAULT 'texto',
    model TEXT DEFAULT 'claude-haiku-4-5',
    temperature FLOAT DEFAULT 0.7,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.agent_playground_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES public.agent_playground_sessions(id) ON DELETE CASCADE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'agent')),
    content TEXT NOT NULL,
    input_kind TEXT DEFAULT 'texto',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    sequence INTEGER NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.agent_playground_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES public.agent_playground_sessions(id) ON DELETE CASCADE NOT NULL,
    message_id TEXT NOT NULL,
    model TEXT NOT NULL,
    selected_modules TEXT[] DEFAULT '{}',
    system_prompt_chars INTEGER,
    history_chars INTEGER,
    message_chars INTEGER,
    response_chars INTEGER,
    input_tokens INTEGER,
    output_tokens INTEGER,
    cache_creation_input_tokens INTEGER,
    cache_read_input_tokens INTEGER,
    cost_usd NUMERIC(10, 8),
    latency_ms INTEGER,
    anthropic_request_id TEXT,
    system_prompt_snapshot TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_playground_sessions TO authenticated;
GRANT ALL ON public.agent_playground_sessions TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_playground_messages TO authenticated;
GRANT ALL ON public.agent_playground_messages TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_playground_runs TO authenticated;
GRANT ALL ON public.agent_playground_runs TO service_role;

-- RLS
ALTER TABLE public.agent_playground_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_playground_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_playground_runs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authenticated users can manage their playground sessions"
ON public.agent_playground_sessions
FOR ALL
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can manage their playground messages"
ON public.agent_playground_messages
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.agent_playground_sessions WHERE id = session_id AND user_id = auth.uid()));

CREATE POLICY "Authenticated users can manage their playground runs"
ON public.agent_playground_runs
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.agent_playground_sessions WHERE id = session_id AND user_id = auth.uid()));
