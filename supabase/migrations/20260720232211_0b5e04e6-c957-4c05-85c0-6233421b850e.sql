-- Migration to add Lead Intelligence fields to agent_playground_runs
ALTER TABLE public.agent_playground_runs 
ADD COLUMN IF NOT EXISTS temperature TEXT,
ADD COLUMN IF NOT EXISTS confidence TEXT,
ADD COLUMN IF NOT EXISTS intent TEXT,
ADD COLUMN IF NOT EXISTS stage TEXT,
ADD COLUMN IF NOT EXISTS purchase_probability INTEGER,
ADD COLUMN IF NOT EXISTS sentiment TEXT,
ADD COLUMN IF NOT EXISTS urgency TEXT,
ADD COLUMN IF NOT EXISTS recommended_action TEXT,
ADD COLUMN IF NOT EXISTS reasoning TEXT;
