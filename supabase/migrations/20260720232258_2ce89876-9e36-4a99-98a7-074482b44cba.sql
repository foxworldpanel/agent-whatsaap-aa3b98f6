-- Migration to add Conversation Score fields
ALTER TABLE public.agent_playground_runs 
ADD COLUMN IF NOT EXISTS conversation_score INTEGER,
ADD COLUMN IF NOT EXISTS conversation_feedback JSONB DEFAULT '{}'::jsonb;
