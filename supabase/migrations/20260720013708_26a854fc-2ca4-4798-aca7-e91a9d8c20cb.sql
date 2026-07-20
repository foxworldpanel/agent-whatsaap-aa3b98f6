-- 1. Remove empty placeholder records for the primary user if they exist
DELETE FROM public.agent_identity WHERE user_id = 'f8da521a-e8db-4efe-8c9b-9bd69749c0a7' AND workspace_id = 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa';
DELETE FROM public.agent_config WHERE user_id = 'f8da521a-e8db-4efe-8c9b-9bd69749c0a7' AND workspace_id = 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa';

-- 2. Transfer the real data from the secondary ID to the primary ID
UPDATE public.agent_identity 
SET user_id = 'f8da521a-e8db-4efe-8c9b-9bd69749c0a7' 
WHERE workspace_id = 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa' 
  AND user_id = '09f4dee9-0a1b-4c43-b083-75cc64feb99d';

UPDATE public.agent_config 
SET user_id = 'f8da521a-e8db-4efe-8c9b-9bd69749c0a7' 
WHERE workspace_id = 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa' 
  AND user_id = '09f4dee9-0a1b-4c43-b083-75cc64feb99d';

-- 3. Update the workspace ownership
UPDATE public.workspaces 
SET user_id = 'f8da521a-e8db-4efe-8c9b-9bd69749c0a7' 
WHERE id = 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa';

-- 4. Transfer integrations (API keys)
UPDATE public.integrations
SET user_id = 'f8da521a-e8db-4efe-8c9b-9bd69749c0a7'
WHERE user_id = '09f4dee9-0a1b-4c43-b083-75cc64feb99d';

-- 5. Transfer V2 modules if any exist
UPDATE public.agent_modules_v2
SET user_id = 'f8da521a-e8db-4efe-8c9b-9bd69749c0a7'
WHERE workspace_id = 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa'
  AND user_id = '09f4dee9-0a1b-4c43-b083-75cc64feb99d';
