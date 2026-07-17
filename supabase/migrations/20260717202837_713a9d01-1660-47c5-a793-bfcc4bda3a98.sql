
-- Drop the old constraint
ALTER TABLE public.agent_v2_turn_analytics DROP CONSTRAINT IF EXISTS check_workspace_is_mind;

-- Add the new constraint with the correct Mind ID
ALTER TABLE public.agent_v2_turn_analytics ADD CONSTRAINT check_workspace_is_mind 
CHECK (workspace_id = 'bd59fa41-3994-4340-9a28-660c63966085'::uuid);
