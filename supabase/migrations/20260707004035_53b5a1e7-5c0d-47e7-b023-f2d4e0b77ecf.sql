UPDATE public.agent_identity
SET
  exemplo_disparo = regexp_replace(
    regexp_replace(exemplo_disparo, '@sourcee', '{handle_instagram_exemplo}', 'g'),
    'Oi,\s*bom\s*dia\s*Romulo!?',
    'Oi, bom dia!',
    'gi'
  ),
  updated_at = now()
WHERE exemplo_disparo ILIKE '%Romulo%'
   OR exemplo_disparo ILIKE '%sourcee%';