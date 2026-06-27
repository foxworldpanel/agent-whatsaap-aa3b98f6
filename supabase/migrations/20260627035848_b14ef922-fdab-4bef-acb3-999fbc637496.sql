
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_reason text,
  ADD COLUMN IF NOT EXISTS auto_paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS internal_note text;

CREATE INDEX IF NOT EXISTS conversations_needs_review_idx
  ON public.conversations (user_id, needs_review)
  WHERE needs_review = true;
