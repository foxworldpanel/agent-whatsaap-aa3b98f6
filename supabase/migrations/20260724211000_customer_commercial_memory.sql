-- Memória comercial persistente por contato.
CREATE TABLE IF NOT EXISTS public.customer_commercial_memory (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  lifecycle text NOT NULL DEFAULT 'novo_lead'
    CHECK (lifecycle IN ('novo_lead','interessado','negociacao','pronto_para_comprar','cliente','cliente_recorrente')),
  converted_at timestamptz,
  purchase_count integer NOT NULL DEFAULT 0 CHECK (purchase_count >= 0),
  preferred_platform text,
  preferred_product text,
  last_purchase_summary text,
  next_opportunity text,
  repurchase_potential text NOT NULL DEFAULT 'baixo'
    CHECK (repurchase_potential IN ('baixo','medio','alto')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, contact_id)
);

CREATE INDEX IF NOT EXISTS customer_commercial_memory_contact_idx
  ON public.customer_commercial_memory(contact_id);

ALTER TABLE public.customer_commercial_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_commercial_memory_owner_select ON public.customer_commercial_memory;
CREATE POLICY customer_commercial_memory_owner_select
  ON public.customer_commercial_memory FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = customer_commercial_memory.workspace_id
        AND w.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS customer_commercial_memory_owner_insert ON public.customer_commercial_memory;
CREATE POLICY customer_commercial_memory_owner_insert
  ON public.customer_commercial_memory FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = customer_commercial_memory.workspace_id
        AND w.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS customer_commercial_memory_owner_update ON public.customer_commercial_memory;
CREATE POLICY customer_commercial_memory_owner_update
  ON public.customer_commercial_memory FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = customer_commercial_memory.workspace_id
        AND w.user_id = auth.uid()
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = customer_commercial_memory.workspace_id
        AND w.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS customer_commercial_memory_owner_delete ON public.customer_commercial_memory;
CREATE POLICY customer_commercial_memory_owner_delete
  ON public.customer_commercial_memory FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = customer_commercial_memory.workspace_id
        AND w.user_id = auth.uid()
    )
  );
