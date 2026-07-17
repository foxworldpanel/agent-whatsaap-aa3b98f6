
-- Update the constraint in analytics table first (it was just added with the 'wrong' ID)
ALTER TABLE public.agent_v2_turn_analytics DROP CONSTRAINT IF EXISTS check_workspace_is_mind;
ALTER TABLE public.agent_v2_turn_analytics ADD CONSTRAINT check_workspace_is_mind 
CHECK (workspace_id = 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa'::uuid);

-- Note: We are assuming 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa' is the canonical Mind ID 
-- because it's the only one in the workspaces table.
