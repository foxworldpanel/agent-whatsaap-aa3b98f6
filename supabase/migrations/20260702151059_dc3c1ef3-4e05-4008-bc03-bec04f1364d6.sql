
CREATE TABLE public.test_numbers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, phone)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.test_numbers TO authenticated;
GRANT ALL ON public.test_numbers TO service_role;
ALTER TABLE public.test_numbers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own test numbers" ON public.test_numbers
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_test_numbers_user_phone ON public.test_numbers(user_id, phone);
