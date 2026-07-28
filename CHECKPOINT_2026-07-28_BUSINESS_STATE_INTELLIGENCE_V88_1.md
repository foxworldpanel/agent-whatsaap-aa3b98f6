# Checkpoint — Business State Intelligence v88.1

## Alterações aplicadas

- Reaproveitado o `BusinessStateV3` como fonte única de verdade comercial.
- Adicionados objetivo ativo, score de compra, confiança do estado, urgência e indicador `waitingCustomer`.
- Estado `adiado` passa a orientar explicitamente que o agente aguarde o cliente sem nova oferta/pergunta.
- Fechamento e pagamento mantêm qualificação bloqueada, evitando perguntas repetidas.
- Reclamações e solicitações de humano continuam superiores a qualquer objetivo comercial.
- Campos persistidos na tabela `conversation_business_state_v3` por migration incremental.
- Lead Intelligence do orchestrator passa a exibir `Aguardando cliente` quando aplicável.

## Migration

Aplicar `20260728104000_business_state_commercial_intelligence.sql` no Supabase/Lovable.

## Validação

- Teste de regressão adicionado em `tests/agent-v3/business-state-commercial-intelligence.test.ts`.
- ZIP validado com `unzip -t`.
- O pacote não contém `node_modules`; por isso o Vitest/build completo não foi executado neste ambiente.
