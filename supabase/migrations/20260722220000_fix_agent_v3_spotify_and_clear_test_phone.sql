-- Corrige metadados essenciais de roteamento do Agent V3 sem sobrescrever conteúdo do CMS.
UPDATE public.agent_modules_v3
SET
  selector_platforms = ARRAY['spotify']::text[],
  selector_triggers = ARRAY['spotify','playlist','playlists','plays','streams','ouvintes','save','saves']::text[],
  updated_at = now()
WHERE key = 'spotify';

UPDATE public.agent_modules_v3 SET selector_platforms = ARRAY['instagram']::text[], updated_at = now() WHERE key = 'instagram';
UPDATE public.agent_modules_v3 SET selector_platforms = ARRAY['youtube']::text[], updated_at = now() WHERE key = 'youtube';
UPDATE public.agent_modules_v3 SET selector_platforms = ARRAY['tiktok']::text[], updated_at = now() WHERE key = 'tiktok';
UPDATE public.agent_modules_v3 SET selector_platforms = ARRAY['kwai']::text[], updated_at = now() WHERE key = 'kwai';
UPDATE public.agent_modules_v3 SET selector_platforms = ARRAY['facebook']::text[], updated_at = now() WHERE key = 'facebook';

-- Limpa somente a memória interna V3 do telefone de teste.
DELETE FROM public.conversations_v3
WHERE regexp_replace(phone, '[^0-9]', '', 'g') IN ('5511970116430', '11970116430');
