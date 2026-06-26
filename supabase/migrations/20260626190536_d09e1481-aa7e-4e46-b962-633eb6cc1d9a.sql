
-- Free trial dedup by link + follow-up tracking
ALTER TABLE public.free_trials
  ADD COLUMN IF NOT EXISTS link_normalized text,
  ADD COLUMN IF NOT EXISTS notified_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS followup_sent_at timestamptz;

-- Backfill normalization for existing rows (best-effort)
UPDATE public.free_trials
  SET link_normalized = lower(regexp_replace(split_part(link_enviado, '?', 1), '/+$', ''))
  WHERE link_normalized IS NULL AND link_enviado IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS free_trials_user_link_norm_key
  ON public.free_trials(user_id, link_normalized)
  WHERE link_normalized IS NOT NULL;

CREATE INDEX IF NOT EXISTS free_trials_followup_idx
  ON public.free_trials(notified_completed_at)
  WHERE notified_completed = true AND followup_sent_at IS NULL;
