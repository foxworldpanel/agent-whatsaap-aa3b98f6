
CREATE TABLE public.agent_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  phone TEXT,
  conversation_id UUID,
  type TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info',
  summary TEXT NOT NULL,
  prompt TEXT,
  response TEXT,
  error TEXT,
  duration_ms INTEGER,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_logs TO authenticated;
GRANT ALL ON public.agent_logs TO service_role;

ALTER TABLE public.agent_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own agent logs"
  ON public.agent_logs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_agent_logs_user_created ON public.agent_logs(user_id, created_at DESC);
CREATE INDEX idx_agent_logs_phone ON public.agent_logs(phone);
CREATE INDEX idx_agent_logs_level ON public.agent_logs(level);
CREATE INDEX idx_agent_logs_type ON public.agent_logs(type);

ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_logs;

-- 7-day retention cleanup
CREATE OR REPLACE FUNCTION public.cleanup_old_agent_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.agent_logs WHERE created_at < now() - INTERVAL '7 days';
END;
$$;

-- Schedule cleanup daily via pg_cron if available
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('cleanup-agent-logs', '0 3 * * *', $cron$SELECT public.cleanup_old_agent_logs();$cron$);
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
