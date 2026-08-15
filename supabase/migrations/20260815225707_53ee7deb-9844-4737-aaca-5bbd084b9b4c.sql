UPDATE agent_config
SET response_delay_min_sec = 5,
    response_delay_max_sec = 10
WHERE workspace_id = 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa';

SELECT response_delay_min_sec, response_delay_max_sec, typing_indicator_enabled
FROM agent_config
WHERE workspace_id = 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa';