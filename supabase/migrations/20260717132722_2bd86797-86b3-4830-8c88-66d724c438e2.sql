UPDATE public.catalog_cache 
SET hidden = false 
WHERE nome ILIKE '%Spotify - Plays + Ouvintes [GLOBAL]%' 
AND workspace_id = 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa';