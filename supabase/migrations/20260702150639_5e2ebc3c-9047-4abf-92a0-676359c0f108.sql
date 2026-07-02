ALTER TABLE public.blast_campaigns
ADD COLUMN IF NOT EXISTS dispatch_mode text NOT NULL DEFAULT 'agente_livre'
CHECK (dispatch_mode IN ('agente_livre', 'fluxo_visual'));