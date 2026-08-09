UPDATE agent_modules_v3
SET selector_intents = '{}'
WHERE key = 'spotify_servicos';

SELECT key, selector_intents, selector_platforms
FROM agent_modules_v3
WHERE key = 'spotify_servicos';