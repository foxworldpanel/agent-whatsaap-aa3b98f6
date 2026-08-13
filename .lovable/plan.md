# Plano: Conversation Facts Engine (SPRINT-001)

Implementar uma camada de extração e persistência de fatos estruturados da conversa para melhorar o contexto determinístico do agente e a qualificação de leads.

## Etapas

1. **Expandir Schema de Fatos**
   - Atualizar `ConversationFactsV3` em `src/lib/agent-v3/memory/conversation-facts.server.ts`.
   - Adicionar categorias: Sales (budget, quantity), Music (link, reference), Objections (trust, price, time), Conversation (last_topic).

2. **Aprimorar Extração Determinística**
   - Implementar novas regex em `extractConversationFactsV3` para os novos campos.
   - Otimizar `cleanFact` e `firstMatch`.

3. **Integrar no Pipeline de Execução**
   - Instrumentar `src/lib/agent-v3/core/execute-agent.server.ts` para disparar a extração após cada turno do Claude.
   - Conectar com `saveOrderContextV3` e `persistBusinessStateV3` (se aplicável).

4. **Injeção no Orquestrador**
   - Atualizar `src/lib/agent-v3/orchestrator.server.ts` para injetar os fatos consolidados no `systemPrompt`.

## Detalhes Técnicos

- **Persistência**: Utilizar a coluna `order_context` em `conversations_v3` para fatos de pedido e metadados de inteligência para o restante.
- **Hierarquia**: Fatos estruturados (determinísticos) têm precedência sobre a "memória" do LLM para evitar alucinações de preço ou nome.
- **Regex**: Padrões em PT-BR para detecção de intenção de compra e sinalização de orçamento.
