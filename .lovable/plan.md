## Fase 2.5 — Isolamento real de workspace (pré-requisito da Fase 3)

Objetivo: eliminar os 3 bloqueios técnicos identificados para que dois workspaces do mesmo usuário fiquem 100% isolados em leitura, escrita e identidade de agente, sem quebrar Mind-Campanha nem Mind-Disparo.

### 1. Migração de schema

Uma única migração que:

- **PKs compostas** (permite 1 linha por workspace):
  - `agent_identity`: `DROP CONSTRAINT ... PRIMARY KEY`, novo PK `(user_id, workspace_id)`
  - `agent_config`: idem
  - `integrations`: idem (mantém `user_id` como chave, adiciona `workspace_id`)
  - Backfill: as linhas existentes já têm `workspace_id` do default (Mind), ok.
- **Uniques por workspace**:
  - `contact_categories`: drop `(user_id, slug)` → `(user_id, workspace_id, slug)`
  - `free_test_services`: drop `(user_id, service_id)` → `(user_id, workspace_id, service_id)`
- **RLS reescrita** para ler o header via GUC `request.headers` (PostgREST):
  - Helper `public.current_workspace_id()` SECURITY DEFINER retornando `nullif(current_setting('request.headers', true)::json->>'x-workspace-id','')::uuid`
  - Substitui `current_setting('app.workspace_id')` por `current_workspace_id()` em todas as policies da Fase 2 (`agent_identity`, `agent_config`, `integrations`, `contact_categories`, `free_test_services`, `contacts`, `conversations`, `messages`, `whatsapp_numbers`, `agent_medias`, `blast_*`, etc.)
  - Modo estrito: se `current_workspace_id()` for NULL, fallback = workspace default do usuário (compatível com Mind quando header ausente, ex.: webhook)
- **Trigger `set_default_workspace_id`** passa a usar `current_workspace_id()` primeiro, depois cai no default.

### 2. Middleware server: forwarding do header para PostgREST

Novo arquivo `src/lib/workspace-scope-middleware.ts`:

- Server-side middleware que roda **depois** de `requireSupabaseAuth`
- Lê `x-workspace-id` do request original (`getRequest().headers.get(...)`)
- Recria `context.supabase` com um custom fetch que adiciona `x-workspace-id` em toda chamada PostgREST — garante que a policy enxerga o header via `request.headers` GUC
- Adiciona `context.workspaceId` (string | null) para uso opcional em handlers

Todos os `.middleware([requireSupabaseAuth])` viram `.middleware([requireSupabaseAuth, withWorkspaceScope])`. Isso é edit em massa (~25 arquivos `.functions.ts`) mas mecânico.

### 3. Webhook (numbers → conversations)

`src/routes/api/public/whatsapp/webhook.ts` (ou equivalente): ao criar `conversation`/`messages`, propaga `workspace_id` do `whatsapp_number` explicitamente (não confia no trigger, porque webhook não tem header). Trigger continua como fallback via `is_default`.

### 4. Validação (na ordem que você pediu)

1. `bun run test:agent` — confirmar 41 testes passando
2. Teste manual real:
   - Mind SMM Panel continua respondendo (Júlia intacta)
   - Mind-Campanha e Mind-Disparo funcionando
3. **Prova de isolamento** (antes de liberar Fase 3):
   - Criar workspace temporário "TESTE-ISO" via SQL direto
   - Trocar UI para esse workspace
   - Confirmar que `contacts`, `conversations`, `agent_identity`, `contact_categories` retornam VAZIO
   - Voltar para Mind SMM Panel e confirmar dados intactos
   - Deletar workspace temporário

### Arquivos afetados

- 1 migração nova
- `src/lib/workspace-scope-middleware.ts` (novo)
- ~25 `src/lib/*.functions.ts` (append `withWorkspaceScope` no array)
- `src/start.ts` (nenhuma mudança — attachWorkspaceHeader já envia header)
- webhook route (propaga workspace_id explícito)

### Riscos assumidos

- Como todas as policies mudam ao mesmo tempo, se a migração falhar no meio, o app pode ficar sem acesso até rollback. Mitigação: migração idempotente com `DROP POLICY IF EXISTS` antes de `CREATE POLICY`.
- Header ausente = fallback pro workspace default. Isso preserva webhook e chamadas legadas, mas significa que se o cliente esquecer o header, escreve no Mind. Aceito porque `attachWorkspaceHeader` já está registrado global.

Confirma e eu executo a migração (aprovação separada obrigatória) + código.