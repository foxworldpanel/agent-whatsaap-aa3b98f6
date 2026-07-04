## Objetivo

Centralizar personalidade, regras de comportamento e script de vendas da Júlia em **uma única fonte de verdade** — armazenada no banco, editável pela UI, consumida pelos dois builders (`buildSystemPrompt` no webhook e `generateAgentReplyWithMeta` em `ai.server.ts`). Elimina os blocos duplicados/hardcoded que causaram os bugs de hoje.

## Arquitetura

```text
DB: agent_identity (1 linha por user_id)
        │
        ▼
src/lib/agent-identity.server.ts
  ├── loadAgentIdentity(userId)         ← lê DB + fallback defaults
  ├── DEFAULT_IDENTITY                  ← texto canônico das 9 regras
  └── buildSharedRules(identity, ctx)   ← monta bloco textual único
        │
        ├──► ai.server.ts        (generateAgentReplyWithMeta)
        └──► uazapi-webhook.ts   (buildSystemPrompt)

UI: src/components/agente/IdentidadeCard.tsx  (na tela Agente IA)
    server fns: getAgentIdentity / updateAgentIdentity
```

## Passos

**1. Migration** — nova tabela `agent_identity`:
- colunas: `user_id uuid PK ref auth.users`, `persona text`, `regra_emoji text`, `regra_split text`, `terminologia_redes text`, `regra_teste_gratis text`, `regra_anti_invencao text`, `exemplo_disparo text`, `reconhecimento_interesse text`, `regra_encerramento text`, `updated_at timestamptz default now()`
- GRANTs padrão (`authenticated` full, `service_role` all)
- RLS: `auth.uid() = user_id` para todas as ops
- trigger `set_updated_at`

**2. `src/lib/agent-identity.server.ts`** (novo):
- `DEFAULT_IDENTITY` com os 9 blocos textuais do pedido (persona, emoji, split, terminologia, teste grátis, anti-invenção, exemplo disparo, reconhecimento interesse, encerramento)
- `loadAgentIdentity(userId)`: SELECT via `supabaseAdmin`, faz merge com defaults por campo (fallback quando null/vazio)
- `buildSharedRules(identity, { freeTestServices, catalog })`: retorna um único bloco markdown pronto pra colar **no início** do system prompt, injetando dinamicamente a lista de serviços elegíveis a teste grátis dentro da seção 5

**3. `src/lib/agent-identity.functions.ts`** (novo, server fns):
- `getAgentIdentity` (middleware `requireSupabaseAuth`) → retorna registro + defaults efetivos
- `updateAgentIdentity` (idem) → upsert por `user_id`, valida cada campo com Zod (todos opcionais, string)

**4. Refactor dos builders** — remover blocos hardcoded duplicados e substituir por chamada única a `buildSharedRules()`:
- `src/lib/ai.server.ts`: identificar seções "PERSONA", "EMOJI", "SPLIT", "TERMINOLOGIA", "TESTE GRÁTIS — REGRAS DE OURO", "EXEMPLO_MODELO_...", "RECONHECIMENTO DE INTERESSE", "REGRA DE ENCERRAMENTO" e substituir pela injeção de `buildSharedRules()` **no topo** do system prompt (antes dos módulos de knowledge/catálogo). Guardas em código (`guardFreeTrialOffer`, etc.) ficam intactas.
- `src/routes/api/public/hooks/uazapi-webhook.ts`: mesma substituição em `buildSystemPrompt`. Blast dispatcher continua usando sua abertura de 3 partes própria (regra 3 permite exceção).

**5. UI — `src/components/agente/IdentidadeCard.tsx`** (novo):
- Card colapsável no topo da tela Agente IA
- 9 `Textarea` (um por regra), placeholder mostra o default, botão "Restaurar padrão" por campo (limpa → volta ao default)
- Botão "Salvar" chama `updateAgentIdentity`, invalida queries relacionadas
- Adicionado em `src/routes/_authenticated/agente.tsx` (ou equivalente) antes dos cards existentes

**6. Validação end-to-end** (via psql + Playwright no preview) após implementar:
- Confirmar tabela criada + linha default carregada para o user de teste
- Rodar bateria: (a) blast → resposta "blz" gera historyCount≥2 com abertura; (b) fluxo de vendas menciona "views" com menor quantidade + preço; (c) horas de exibição → sem oferta de teste grátis; (d) recusa clara → encerramento educado; (e) mensagem curta sem split.
- Só reportar "pronto" depois de colar evidência (query do banco + logs do generateAgentReplyWithMeta mostrando o bloco compartilhado no início do prompt).

## Detalhes técnicos

- `buildSharedRules` retorna string, **não** template com `{{}}` — evita bug de placeholder não substituído.
- `loadAgentIdentity` é chamada uma vez por request (memoização via `Map<userId, {value, expiresAt}>` com TTL 30s) para não bater no DB em cada geração.
- Lista de serviços elegíveis a teste grátis é injetada dinamicamente pelo builder (não fica no texto salvo pelo user) — o campo `regra_teste_gratis` no DB contém só a política; a lista real vem de `free_test_services`.
- Fallback: se `loadAgentIdentity` falhar, usa `DEFAULT_IDENTITY` inteiro e loga warn — nunca bloqueia geração.
- Nenhuma mudança em `blast.functions.ts` além de garantir que o dispatcher continua usando `generateAgentReplyWithMeta` (que já vai puxar do novo módulo).

## Escopo fora deste plano

- Não altero as guardas de código (`guardFreeTrialOffer`, dedup de conversation, etc.) — elas continuam como cinto de segurança sobre o LLM.
- Não mexo em `catalog_cache`, `free_test_services`, `opening_templates`.
- Versionamento/histórico de edições da identidade fica para depois se pedir.
