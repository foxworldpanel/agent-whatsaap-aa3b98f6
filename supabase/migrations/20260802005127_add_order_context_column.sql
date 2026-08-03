-- Adiciona a coluna order_context (JSONB) na tabela conversations_v3
-- já existente. Não cria tabela nova, não altera nenhuma coluna existente.
-- Essa coluna guarda o estado estruturado do pedido (plataforma, serviço,
-- quantidade, etc.) — ainda não é lida por nenhuma lógica de decisão,
-- só é preenchida pra fins de observação/log nessa fase.
ALTER TABLE public.conversations_v3
  ADD COLUMN IF NOT EXISTS order_context JSONB;

COMMENT ON COLUMN public.conversations_v3.order_context IS
  'Estado estruturado do pedido (OrderContext V3): plataforma, serviço, quantidade, etc. Fase de observação — ainda não influencia decisões do agente.';
