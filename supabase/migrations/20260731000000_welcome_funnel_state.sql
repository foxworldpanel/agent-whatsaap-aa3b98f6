ALTER TABLE public.welcome_funnel_runs 
ADD COLUMN IF NOT EXISTS status text DEFAULT 'running',
ADD COLUMN IF NOT EXISTS last_step text,
ADD COLUMN IF NOT EXISTS last_step_index integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS last_error_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS error_message text,
ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

-- Garantir privilégios
GRANT SELECT, INSERT, UPDATE, DELETE ON public.welcome_funnel_runs TO authenticated;
GRANT ALL ON public.welcome_funnel_runs TO service_role;

-- Criar tabela de eventos de funil se não existir
CREATE TABLE IF NOT EXISTS public.welcome_funnel_run_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    workspace_id uuid NOT NULL,
    funnel_id uuid REFERENCES public.welcome_funnels(id) ON DELETE CASCADE NOT NULL,
    contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE NOT NULL,
    event_type text NOT NULL,
    step_key text,
    message text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.welcome_funnel_run_events TO authenticated;
GRANT ALL ON public.welcome_funnel_run_events TO service_role;
ALTER TABLE public.welcome_funnel_run_events ENABLE ROW LEVEL SECURITY;
