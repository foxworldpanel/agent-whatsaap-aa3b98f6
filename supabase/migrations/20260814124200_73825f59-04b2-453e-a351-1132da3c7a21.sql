ALTER TABLE public.conversations_v3 ADD COLUMN IF NOT EXISTS order_context jsonb;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'conversations_v3'
  AND column_name = 'order_context';