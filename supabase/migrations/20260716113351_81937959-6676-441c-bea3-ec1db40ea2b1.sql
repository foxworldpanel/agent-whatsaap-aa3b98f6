
CREATE TABLE IF NOT EXISTS public.price_table (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    platform text NOT NULL,
    service text NOT NULL,
    audience text NOT NULL,
    price_per_1000 numeric NOT NULL,
    min_quantity integer NOT NULL,
    max_quantity integer NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_table TO authenticated;
GRANT ALL ON public.price_table TO service_role;

ALTER TABLE public.price_table ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own price table rows"
ON public.price_table
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
