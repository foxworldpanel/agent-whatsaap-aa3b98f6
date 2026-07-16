CREATE TABLE IF NOT EXISTS public.price_table (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform TEXT NOT NULL,
    service TEXT NOT NULL,
    audience TEXT NOT NULL DEFAULT 'Brasil',
    price_per_1000 NUMERIC NOT NULL DEFAULT 0,
    min_quantity INTEGER NOT NULL DEFAULT 0,
    max_quantity INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_table TO authenticated;
GRANT ALL ON public.price_table TO service_role;

-- RLS
ALTER TABLE public.price_table ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'price_table' AND policyname = 'Users can manage their own price table'
    ) THEN
        CREATE POLICY "Users can manage their own price table"
        ON public.price_table
        FOR ALL
        TO authenticated
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id);
    END IF;
END
$$;

-- Migration ends
