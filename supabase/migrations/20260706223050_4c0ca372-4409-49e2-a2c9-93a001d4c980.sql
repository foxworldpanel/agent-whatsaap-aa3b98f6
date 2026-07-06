-- Playlist sales table + agent_config columns for the WhatsApp Playlist purchase flow

-- 1) Table
CREATE TABLE IF NOT EXISTS public.playlist_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workspace_id uuid,
  contact_id uuid,
  conversation_id uuid,
  telefone text NOT NULL,
  pacote text NOT NULL CHECK (pacote IN ('ecletica','eletronica')),
  music_link text,
  smm_service_id text,
  smm_order_id text,
  amount_expected numeric(10,2) NOT NULL DEFAULT 49.90,
  amount_paid numeric(10,2),
  pix_proof_valid boolean,
  status text NOT NULL DEFAULT 'aguardando_comprovante'
    CHECK (status IN ('aguardando_comprovante','aguardando_link','enviado','processando','completo','erro','cancelado')),
  status_message text,
  playlists_sent_at timestamptz,
  completed_at timestamptz,
  raw_response jsonb,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.playlist_sales TO authenticated;
GRANT ALL ON public.playlist_sales TO service_role;

ALTER TABLE public.playlist_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own playlist_sales"
  ON public.playlist_sales FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_playlist_sales_user_status ON public.playlist_sales(user_id, status);
CREATE INDEX IF NOT EXISTS idx_playlist_sales_conversation ON public.playlist_sales(conversation_id);
CREATE INDEX IF NOT EXISTS idx_playlist_sales_order ON public.playlist_sales(smm_order_id);

CREATE TRIGGER trg_playlist_sales_updated_at
  BEFORE UPDATE ON public.playlist_sales
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_playlist_sales_workspace
  BEFORE INSERT ON public.playlist_sales
  FOR EACH ROW EXECUTE FUNCTION public.set_default_workspace_id();

-- 2) Agent config columns for Playlist packages
ALTER TABLE public.agent_config
  ADD COLUMN IF NOT EXISTS playlist_pix_key text DEFAULT '24981222957',
  ADD COLUMN IF NOT EXISTS playlist_pix_holder text DEFAULT 'Eliseu Mendes Oliveira',
  ADD COLUMN IF NOT EXISTS playlist_price numeric(10,2) DEFAULT 49.90,
  ADD COLUMN IF NOT EXISTS playlist_ecletica_service_id text,
  ADD COLUMN IF NOT EXISTS playlist_eletronica_service_id text,
  ADD COLUMN IF NOT EXISTS playlist_ecletica_links text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS playlist_eletronica_links text[] DEFAULT '{}';
