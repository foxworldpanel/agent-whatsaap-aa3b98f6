
CREATE TABLE public.free_test_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_id text NOT NULL,
  service_name text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  quantity integer NOT NULL DEFAULT 100,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, service_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.free_test_services TO authenticated;
GRANT ALL ON public.free_test_services TO service_role;

ALTER TABLE public.free_test_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fts_owner_all" ON public.free_test_services
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER fts_set_updated_at BEFORE UPDATE ON public.free_test_services
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.integrations
  ADD COLUMN IF NOT EXISTS smm_last_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS smm_last_sync_count integer,
  ADD COLUMN IF NOT EXISTS smm_last_sync_error text;
