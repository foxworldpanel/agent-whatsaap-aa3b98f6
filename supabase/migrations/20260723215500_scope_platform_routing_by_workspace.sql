-- Agent V3: consolida o roteamento das plataformas de forma explícita por workspace.
-- Esta migration substitui semanticamente a migration global 20260722220000 sem
-- reescrever o histórico já aplicado. O UPDATE continua atingindo todos os workspaces
-- existentes intencionalmente, mas cada linha é tratada dentro da sua própria chave
-- (workspace_id, key), sem depender de um workspace implícito/default.
--
-- IMPORTANTE: não altera conteúdo, preço, versão ou status dos módulos.

UPDATE public.agent_modules_v3 AS m
SET
  selector_platforms = CASE m.key
    WHEN 'spotify'   THEN ARRAY['spotify']::text[]
    WHEN 'instagram' THEN ARRAY['instagram']::text[]
    WHEN 'youtube'   THEN ARRAY['youtube']::text[]
    WHEN 'tiktok'    THEN ARRAY['tiktok']::text[]
    WHEN 'kwai'      THEN ARRAY['kwai']::text[]
    WHEN 'facebook'  THEN ARRAY['facebook']::text[]
    ELSE m.selector_platforms
  END,
  selector_triggers = CASE
    WHEN m.key = 'spotify'
      THEN ARRAY['spotify','playlist','playlists','plays','streams','ouvintes','save','saves']::text[]
    ELSE m.selector_triggers
  END,
  updated_at = now()
WHERE m.workspace_id IS NOT NULL
  AND m.key IN ('spotify','instagram','youtube','tiktok','kwai','facebook');
