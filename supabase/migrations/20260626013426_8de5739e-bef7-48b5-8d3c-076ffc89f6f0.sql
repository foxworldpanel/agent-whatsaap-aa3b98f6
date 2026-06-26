
CREATE TABLE public.panel_guide (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT NOT NULL,
  extracted_content TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.panel_guide TO authenticated;
GRANT ALL ON public.panel_guide TO service_role;

ALTER TABLE public.panel_guide ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own panel guide"
ON public.panel_guide FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER panel_guide_set_updated_at
BEFORE UPDATE ON public.panel_guide
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX panel_guide_user_id_idx ON public.panel_guide(user_id);
