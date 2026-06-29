ALTER TABLE public.panel_guide
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS source_slot TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS panel_guide_user_storage_path_idx
  ON public.panel_guide(user_id, storage_path)
  WHERE storage_path IS NOT NULL;

CREATE INDEX IF NOT EXISTS panel_guide_user_source_slot_idx
  ON public.panel_guide(user_id, source_slot);