# Agent V3 — v89.1 Continuidade do Estado Comercial

## Correção aplicada

O runtime agora carrega o estado comercial persistido antes de classificar a nova mensagem.

Isso impede regressões como:

- pagamento → descoberta após uma resposta curta;
- fechamento → nova qualificação por uma dúvida operacional;
- repetição de perguntas já respondidas durante o fechamento.

## Regras preservadas

- atendimento humano obrigatório continua tendo prioridade máxima;
- reclamações e riscos jurídicos não são sobrescritos por objetivo comercial;
- nova compra explícita pode iniciar uma nova decisão;
- confirmação de pagamento/pedido avança normalmente para pós-venda;
- adiamento e abandono continuam encerrando a pressão comercial.

## Arquivos alterados

- `src/lib/agent-v3/brain/business-state.server.ts`
- `src/lib/agent-v3/memory/business-state-memory.server.ts`
- `src/routes/api/public/hooks/uazapi-webhook.ts`
- `tests/agent-v3/business-state-continuity.test.ts`

## Validação

Foram adicionados testes de regressão para continuidade de pagamento, fechamento, nova compra e handoff humano.

O ambiente não concluiu `npm ci`, portanto o Vitest completo não foi executado nesta sessão.
