-- V3 Stable: o CMS passa a controlar também o roteamento dos módulos.
ALTER TABLE public.agent_modules_v3
  ADD COLUMN IF NOT EXISTS always_load boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS selector_intents text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS selector_stages text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS selector_platforms text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS selector_products text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS selector_triggers text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS selector_dependencies text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS selector_conflicts text[] NOT NULL DEFAULT '{}';

-- Núcleo: obrigatório por decisão do CMS, não por constante no código.
UPDATE public.agent_modules_v3
SET always_load = true, priority = GREATEST(priority, 100)
WHERE key IN ('identidade', 'regras_gerais', 'comportamento_humano');

-- Plataformas.
UPDATE public.agent_modules_v3 SET selector_platforms = ARRAY['instagram'], priority = GREATEST(priority, 80) WHERE key = 'instagram';
UPDATE public.agent_modules_v3 SET selector_platforms = ARRAY['youtube'], priority = GREATEST(priority, 80) WHERE key = 'youtube';
UPDATE public.agent_modules_v3 SET selector_platforms = ARRAY['spotify'], priority = GREATEST(priority, 80) WHERE key = 'spotify';
UPDATE public.agent_modules_v3 SET selector_platforms = ARRAY['tiktok'], priority = GREATEST(priority, 80) WHERE key = 'tiktok';
UPDATE public.agent_modules_v3 SET selector_platforms = ARRAY['kwai'], priority = GREATEST(priority, 80) WHERE key = 'kwai';
UPDATE public.agent_modules_v3 SET selector_platforms = ARRAY['facebook'], priority = GREATEST(priority, 80) WHERE key = 'facebook';

-- Fluxos comerciais e de atendimento.
UPDATE public.agent_modules_v3 SET selector_intents = ARRAY['compra','consulta_preco','descoberta'], priority = GREATEST(priority, 70) WHERE key = 'fluxo_vendas';
UPDATE public.agent_modules_v3 SET selector_intents = ARRAY['compra','consulta_preco'], priority = GREATEST(priority, 65) WHERE key = 'psicologia_vendas';
UPDATE public.agent_modules_v3 SET selector_intents = ARRAY['consulta_preco'], selector_triggers = ARRAY['preço','preco','valor','quanto custa','tabela'], priority = GREATEST(priority, 75) WHERE key = 'tabela_precos';
UPDATE public.agent_modules_v3 SET selector_intents = ARRAY['pagamento','pos_compra'], selector_triggers = ARRAY['pix','pagamento','comprovante','recarga','saldo'], priority = GREATEST(priority, 75) WHERE key = 'pagamentos';
UPDATE public.agent_modules_v3 SET selector_intents = ARRAY['suporte','pos_compra'], priority = GREATEST(priority, 75) WHERE key IN ('suporte','suporte_pos_compra');
UPDATE public.agent_modules_v3 SET selector_intents = ARRAY['duvida_seguranca'], priority = GREATEST(priority, 70) WHERE key IN ('objecoes_vendas','prova_social','seguranca');
UPDATE public.agent_modules_v3 SET selector_stages = ARRAY['fechamento'], selector_intents = ARRAY['pagamento'], priority = GREATEST(priority, 70) WHERE key IN ('fechamento_vendas','fechamento_3');
UPDATE public.agent_modules_v3 SET selector_intents = ARRAY['recuperacao'], priority = GREATEST(priority, 60) WHERE key = 'recuperacao_leads';
UPDATE public.agent_modules_v3 SET selector_intents = ARRAY['descoberta'], selector_triggers = ARRAY['como usar','cadastro','painel','site','link'], priority = GREATEST(priority, 60) WHERE key = 'como_usar_painel';

-- Mídia e infraestrutura: disponíveis por gatilho explícito quando existirem no CMS.
UPDATE public.agent_modules_v3 SET selector_triggers = ARRAY['áudio','audio','mensagem de voz'], priority = GREATEST(priority, 50) WHERE key = 'texto_ou_audio';

CREATE INDEX IF NOT EXISTS idx_agent_modules_v3_always_load
  ON public.agent_modules_v3(workspace_id, always_load)
  WHERE enabled = true;
