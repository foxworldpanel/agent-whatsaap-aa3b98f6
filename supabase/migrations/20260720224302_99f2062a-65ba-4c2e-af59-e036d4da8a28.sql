CREATE TABLE IF NOT EXISTS public.conversations_v3 (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    phone text NOT NULL,
    history jsonb NOT NULL DEFAULT '[]'::jsonb,
    updated_at timestamptz DEFAULT now(),
    UNIQUE(user_id, phone)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations_v3 TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations_v3 TO service_role;

ALTER TABLE public.conversations_v3 ENABLE ROW LEVEL SECURITY;

-- Como o sistema usa supabaseAdmin no servidor, as permissões de authenticated/service_role são suficientes, 
-- mas adicionamos uma política de segurança para o service_role por garantia.
CREATE POLICY "Service role can do everything" ON public.conversations_v3
    FOR ALL TO service_role USING (true);
