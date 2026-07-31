# Relatório de estabilização do Agent V3

Data: 2026-07-30  
Branch: `stabilization/v3`  
Base: `main` (`de010da3`)

## Fluxo principal auditado

```text
POST /api/public/hooks/uazapi-webhook
  -> autentica token da instância e identifica workspace/número
  -> extrai telefone, texto/áudio/imagem e messageId
  -> deduplica e persiste a entrada no CRM
  -> aplica gates: fromMe, agente desativado, opt-out, handoff e funil
  -> carrega histórico V3, memória comercial e estado de negócio
  -> runAgentV3Turn
       -> carrega módulos ativos de agent_modules_v3
       -> identifica intenção, etapa, plataforma e produto
       -> seleciona módulos do catálogo pelo metadata do CMS
       -> monta prompt somente com módulos selecionados
       -> consulta Anthropic
       -> aplica guards de preço, promoção, pagamento, contexto e formato
  -> atualiza memória, inteligência e estado comercial
  -> aplica humanização e divisão em mensagens
  -> sendAgentTextGuarded -> Uazapi
  -> persiste cada outbound confirmado no CRM
  -> salva o histórico conversacional V3
```

O fluxo está conectado de ponta a ponta. A entrega de pedidos concluídos e
follow-ups operacionais segue pelo hook separado `smm-poll`, que consulta o
painel configurado e envia a atualização pela mesma integração Uazapi.

## Funil comercial verificado

```text
Saudação
  -> plataforma
  -> objetivo
  -> serviço
  -> catálogo
  -> preço validado
  -> confirmação de compra
  -> pagamento validado
  -> confirmação explícita
  -> entrega/pós-venda
```

O seletor usa o turno atual como autoridade e a memória persistida somente como
fallback. Pagamento não avança sem plataforma, serviço e oferta com preço
existente no catálogo. Confirmação de compra continua exigindo texto explícito
como “paguei”, “comprei” ou “fiz o pedido”.

## Problemas encontrados e corrigidos

- Números internacionais com 10/11 dígitos recebiam `55` indevidamente.
- A memória persistia plataforma e produto, mas não nome, música, artista ou
  objetivo.
- Plataforma/serviço lembrados não chegavam ao seletor; após sair da janela
  recente, o módulo errado podia ser carregado ou nenhum catálogo autoritativo
  era selecionado.
- O painel administrativo executava uma auto-semeadura ativa com catálogo,
  preços, prazos e URL hardcoded ao abrir a configuração.
- O prompt continha exemplos fixos de preços e um domínio comercial fixo.
- O agente podia orientar pagamento sem oferta completa validada.
- Não havia bloqueio final específico contra promoção inventada.
- Restavam um stub V2 sem referências e três testes de uma implementação V2 já
  ausente.

## Correções implementadas

- Preservação do código de país em números explicitamente internacionais.
- Campo JSON estruturado `conversation_facts` na memória comercial existente.
- Extração cumulativa de nome, música, artista e objetivo.
- Injeção de plataforma/produto lembrados como fallback tipado do seletor.
- Guard determinístico de oferta antes do pagamento.
- Guard determinístico de promoção com autoridade nos módulos selecionados.
- Remoção da auto-semeadura comercial; o CMS/banco permanece fonte única.
- Isolamento genérico de URLs já presentes nos módulos, sem domínio no runtime.
- Remoção somente dos artefatos V2 comprovadamente sem uso.

## Arquivos modificados

- `src/lib/agent-v3/memory/conversation-state.server.ts`
- `src/lib/agent-v3/memory/customer-memory.server.ts`
- `src/lib/agent-v3/memory/conversation-facts.server.ts`
- `src/lib/agent-v3/selector/module-selector.server.ts`
- `src/lib/agent-v3/orchestrator.server.ts`
- `src/routes/api/public/hooks/uazapi-webhook.ts`
- `src/lib/agent-v3/admin/admin.functions.ts`
- `supabase/migrations/20260730183000_v3_structured_conversation_facts.sql`
- `tests/agent-v3/memory/conversation-facts.test.ts`
- `tests/agent-v3/selector/selector-memory-fallback.test.ts`
- `tests/agent-v3/commercial-payment-validation.test.ts`

Arquivos removidos:

- `src/lib/agent-v2.functions.ts`
- `tests/agent-v2/brain.test.ts`
- `tests/agent-v2/core-v2.test.ts`
- `tests/agent-v2/resolver.test.ts`

## Testes executados

- Suíte focada de estabilização: 10 arquivos, 33 testes, todos aprovados.
- Build de produção Vite/Nitro: aprovado.
- TypeScript: as mudanças compilam no build; `tsc --noEmit` continua bloqueado
  por dois scripts preexistentes que importam `dotenv` sem declarar o pacote.
- Suíte histórica completa: 451 aprovados e 124 falhos. A maioria das falhas
  procura textos, variáveis ou APIs antigas; a suíte mistura V1, contratos V3
  anteriores e integrações sem workspace/mocks.

## Problemas restantes

- Reconciliar ou arquivar os testes históricos obsoletos sem alterar o runtime
  atual para satisfazer contratos removidos.
- Decidir se os dois scripts manuais que usam `dotenv` devem declarar a
  dependência ou ser retirados do escopo do TypeScript.
- Aplicar a nova migration no ambiente Supabase antes do deploy.
- Executar um teste real controlado com credenciais do workspace para validar
  Anthropic, Supabase, Uazapi e painel SMM de ponta a ponta.
- O projeto possui avisos de depreciação de `inputValidator()` do TanStack; não
  foram alterados nesta estabilização para evitar refatoração ampla.
