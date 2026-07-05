# Plano: Sistema de Workspaces

Sistema para múltiplos negócios/agentes isolados na mesma conta, com seletor no topo. Execução em 3 fases separadas, cada uma validada antes da próxima.

---

## FASE 1 — Schema + Migração de Dados (sem UI)

### 1.1 Nova tabela `workspaces`

```sql
CREATE TABLE public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  icone text DEFAULT '📱',
  cor text DEFAULT 'blue',
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
-- GRANT + RLS (só o dono vê seus workspaces)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspaces TO authenticated;
GRANT ALL ON public.workspaces TO service_role;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_workspaces" ON public.workspaces
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

### 1.2 Ordem exata das migrações (uma migration por bloco, para permitir rollback granular)

Todas as 32 tabelas com `user_id` recebem `workspace_id uuid` (nullable no início, NOT NULL no fim).

**Migração A — criar tabela `workspaces` + seed do "Mind SMM Panel"**
- Cria `workspaces`.
- Para cada `user_id` distinto em `auth.users` que tenha dados, cria 1 workspace `Mind SMM Panel` com `is_default=true`.

**Migração B — adicionar `workspace_id` nullable em todas as 32 tabelas**
- `ALTER TABLE ... ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE`.
- Ainda nullable — nada quebra.

**Migração C — backfill (UPDATE)**
- Para cada tabela: `UPDATE t SET workspace_id = (SELECT id FROM workspaces w WHERE w.user_id = t.user_id AND w.is_default = true)`.
- Feito via tool `supabase--insert` (que aceita UPDATE), não migration.
- Validação: `SELECT count(*) FROM t WHERE workspace_id IS NULL` = 0 para cada tabela.

**Migração D — tornar `workspace_id` NOT NULL + índices**
- `ALTER TABLE ... ALTER COLUMN workspace_id SET NOT NULL`.
- `CREATE INDEX ON t(workspace_id)` para queries rápidas.

**Migração E — atualizar `get_or_create_active_conversation`**
- Adiciona parâmetro `_workspace_id`, incluído no lock e no INSERT.
- Atualiza unique constraint em `conversations` para incluir workspace_id.

**Migração F — atualizar RLS de todas as 32 tabelas (ver 1.3)**

### 1.3 RLS — como garantir isolamento total entre workspaces (ponto crítico)

O modelo atual: `USING (auth.uid() = user_id)`. Isso protege entre USUÁRIOS, mas não entre WORKSPACES do mesmo usuário.

**Estratégia:** função SECURITY DEFINER `user_owns_workspace(_workspace_id)` + policies que checam AMBOS user_id E workspace_id.

```sql
CREATE FUNCTION public.user_owns_workspace(_workspace_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspaces
    WHERE id = _workspace_id AND user_id = auth.uid()
  )
$$;
```

Nova policy padrão em cada tabela (substitui a antiga):
```sql
DROP POLICY <antiga> ON public.<tabela>;
CREATE POLICY "workspace_scoped" ON public.<tabela>
  FOR ALL
  USING (auth.uid() = user_id AND user_owns_workspace(workspace_id))
  WITH CHECK (auth.uid() = user_id AND user_owns_workspace(workspace_id));
```

**Por que isso garante zero vazamento:**
1. `user_id = auth.uid()` — segurança base preservada.
2. `user_owns_workspace(workspace_id)` — mesmo se o cliente enviar `workspace_id` de outro user, é rejeitado.
3. NOT NULL em `workspace_id` — impossível ter linha órfã.
4. Cascade em `workspaces.ON DELETE` — apagar workspace apaga todos os dados dele.
5. As server functions vão SEMPRE injetar `workspace_id` do contexto (não do input do cliente) — ver 1.4.

### 1.4 Server functions — enforcement duplo

Adicionar middleware `requireWorkspace` que:
1. Lê `x-workspace-id` do header (setado pelo cliente via functionMiddleware).
2. Verifica que o workspace pertence ao user via `user_owns_workspace()`.
3. Injeta `context.workspaceId` — todas as queries usam esse valor, nunca input do cliente.

Toda query `.eq("user_id", ...)` vira `.eq("user_id", ...).eq("workspace_id", context.workspaceId)`.

**Nesta Fase 1 (sem UI ainda):** o middleware default cai para o workspace `is_default=true` do usuário. Comportamento idêntico ao atual.

### 1.5 Webhook UAZAPI

`whatsapp_numbers.workspace_id` é a fonte da verdade. O webhook resolve o workspace pelo número que recebeu a mensagem — sem depender do cliente. Contatos são isolados por workspace (mesmo telefone = 2 contatos se estiver em 2 workspaces diferentes).

### 1.6 Rollback plan

Cada migração A-F é independente e reversível:
- **Falha em A**: `DROP TABLE workspaces` — nada mais foi tocado.
- **Falha em B**: `ALTER TABLE ... DROP COLUMN workspace_id` em cada tabela — coluna era nullable, nada usava ainda.
- **Falha em C (backfill)**: nenhum schema mudou desde B; roda o UPDATE de novo.
- **Falha em D**: `ALTER COLUMN workspace_id DROP NOT NULL` — volta ao estado da C.
- **Falha em E**: restaura versão anterior da função (guardada como comentário na migration).
- **Falha em F (RLS)**: cada policy é substituída atomicamente; se der ruim, recria a policy antiga (guardada como comentário).

Backup completo antes da Fase 1: usar Cloud → Advanced settings → Export data.

### 1.7 Validação da Fase 1 (antes de entregar)

- `SELECT count(*) FROM t WHERE workspace_id IS NULL` = 0 em todas as 32 tabelas.
- `bun run test:agent` — 38 testes passam.
- Você testa manualmente: enviar mensagem no Mind-Campanha e Mind-Disparo, ver que agente responde, contatos aparecem, logs registram.

**Só depois da sua confirmação, começa a Fase 2.**

---

## FASE 2 — Seletor de UI

- Componente `<WorkspaceSwitcher />` no topo do `AppShell`.
- Estado global (Zustand ou React context) com `activeWorkspaceId`, persistido em localStorage.
- `functionMiddleware` no `src/start.ts` envia `x-workspace-id` em cada chamada.
- Trocar workspace = `queryClient.clear()` + reload das rotas.
- Cria server fn `listWorkspaces` e `switchWorkspace`.

Validação: você troca entre workspaces, confirma que dados não vazam, testes passam.

---

## FASE 3 — Criação de novo workspace + onboarding

- Botão "+ Criar novo workspace" no seletor.
- Wizard: nome → conectar número WhatsApp → configurar identidade → criar categorias.
- Teste final: criar "Smoke Music" vazio, conectar número, mandar msg, confirmar que aparece SÓ em Smoke Music.

---

## Tabelas afetadas (32)

`agent_config`, `agent_identity`, `agent_logs`, `auto_campaign_runs`, `auto_campaigns`, `blast_campaigns`, `blast_contacts`, `blast_flows`, `blast_logs`, `campaign_logs`, `campaigns`, `catalog_cache`, `contact_categories`, `contact_group_members`, `contact_groups`, `contact_lists`, `contacts`, `conversations`, `extraction_logs`, `forbidden_rules`, `free_test_services`, `free_trials`, `integrations`, `knowledge_base`, `messages`, `opening_templates`, `panel_guide`, `prompt_modules`, `test_numbers`, `welcome_funnel_runs`, `welcome_funnels`, `whatsapp_numbers`.

## Confirmação de preservação dos dados

- Nenhum `DELETE` nesta migração — só `ALTER TABLE ADD COLUMN` e `UPDATE ... SET workspace_id = ...`.
- Todos os `user_id`, `nome`, `telefone`, `messages`, `logs`, `agent_identity` (persona/regras/script) permanecem intactos.
- Após backfill, todos os dados atuais ficam no workspace `Mind SMM Panel` (is_default=true), acessados pela UI exatamente como hoje — enquanto Fase 2 não sobe, o middleware auto-seleciona o default.
