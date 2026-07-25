-- Corrige roteamento autoritativo após modularização do Spotify.
-- Preserva o CONTEÚDO editável dos módulos; altera somente metadados de seleção.

UPDATE public.agent_modules_v3
SET selector_products = ARRAY['plays','ouvintes','saves','seguidores','playlist']::text[],
    selector_conflicts = ARRAY['spotify','tabela_precos']::text[],
    priority = GREATEST(priority, 95),
    updated_at = now()
WHERE key = 'spotify_precos' AND workspace_id IS NOT NULL;

UPDATE public.agent_modules_v3
SET selector_triggers = ARRAY[
      'royalty','royalties','monetização','monetizacao','distribuidora',
      'receber dinheiro','ganhar dinheiro','quanto ganha','quanto vou ganhar',
      'como vou receber','quanto paga','paga mais','pagamento spotify','spotify paga'
    ]::text[],
    selector_conflicts = ARRAY['spotify']::text[],
    updated_at = now()
WHERE key = 'spotify_royalties' AND workspace_id IS NOT NULL;

-- Se a família modular existe, o monolítico não pode voltar a competir com ela.
UPDATE public.agent_modules_v3 legacy
SET enabled = false, updated_at = now()
WHERE legacy.key = 'spotify'
  AND EXISTS (
    SELECT 1 FROM public.agent_modules_v3 modular
    WHERE modular.workspace_id = legacy.workspace_id
      AND modular.enabled = true
      AND modular.key LIKE 'spotify\_%' ESCAPE '\'
  );
