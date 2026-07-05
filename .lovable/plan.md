# Fase 3 — Criar novo workspace + onboarding

## Objetivo

Permitir ao usuário criar um novo workspace do zero via wizard, com dados 100% isolados dos demais, sem herdar nada da Júlia / Mind SMM Panel.

## Entregas

### 1) Botão "+ Criar novo workspace" no seletor

Em `src/components/WorkspaceSwitcher.tsx`, adicionar item fixo no rodapé do `DropdownMenuContent`:
- Separador
- `DropdownMenuItem` com ícone `Plus` e label "Criar novo workspace"
- Ao clicar, abre o wizard (state no próprio switcher, `<CreateWorkspaceWizard open onOpenChange />`).

### 2) Wizard — `src/components/CreateWorkspaceWizard.tsx`

`Dialog` do shadcn com estado interno `step: 1..4` e um objeto `draft` acumulando os dados. Barra de progresso no topo (Passo X de 4). Botões "Voltar" / "Continuar" / "Concluir".

**Passo 1 — Nome do workspace**
- Campos: `nome` (obrigatório, 1-60), `icone` (emoji picker simples com defaults 📱💬🎵🚀🏢), `cor` (5 swatches).
- Ação "Continuar": chama `createWorkspace({ nome, icone, cor })` (nova server fn), guarda `workspaceId` no draft, imediatamente **troca o workspace ativo** (`switchWorkspace(id)` + limpa cache) para que os próximos passos gravem no workspace novo. Volta pro passo 2.
- Se o usuário fechar aqui em diante, o workspace já existe e aparece no seletor (fica só "em branco", ele pode continuar depois pelas páginas normais).

**Passo 2 — Conectar número de WhatsApp**
- Instrução: "Você pode conectar agora ou pular e conectar depois em Números".
- Formulário compacto reaproveitando `createNumber`: `nome`, `uazapi_url`, e um dos dois tokens (mesma regra do formulário atual em `numeros.tsx`). Depois de criar, chama `connectNumber({ id })` e mostra QR code (`<img src={data:image/png;base64,qr}/>`) com botão "Já escaneei". Polling opcional via `refreshNumberStatus` — se ficar complexo, apenas mostrar QR + instrução e permitir avançar; conexão final o usuário confirma na página de Números.
- Botão "Pular" avança para o passo 3 sem número.

**Passo 3 — Identidade do agente**
- Campos essenciais em branco/default genérico: `persona` (placeholder: "Ex: Atendente consultiva da [sua marca], tom próximo e humano"), `regra_estilo_escrita`, `exemplo_disparo`, `reconhecimento_interesse`.
- NÃO pré-carrega os defaults da Júlia — os campos ficam vazios. Ao concluir, chama `updateAgentIdentity` só com os campos preenchidos (os demais ficam null → fallback nos defaults genéricos do sistema por workspace novo).
- Botão "Pular" também permitido; identidade fica 100% nos defaults.

**Passo 4 — Categorias de contato iniciais**
- Lista sugerida: `[{ nome: "Leads", icone: "👤", cor: "blue" }]` marcada por padrão, com botão "+ Adicionar categoria" para o usuário digitar mais.
- Ao concluir, chama nova fn `bulkCreateCategories({ items: [...] })` — insere no workspace ativo.

**Botão final "Concluir"**
- Fecha o wizard, `refresh()` da lista de workspaces, `qc.clear()`, toast "Workspace 'X' criado".

### 3) Server functions novas em `src/lib/workspaces.functions.ts`

- `createWorkspace({ nome, icone?, cor? })` → INSERT em `workspaces` (`user_id = auth.uid()`, `is_default = false`), retorna `{ id }`.
- `bulkCreateCategories({ items: [{nome, icone, cor}] })` — pode viver em `categories.functions.ts`; insere em `contact_categories` para o `user_id`, gera `slug` a partir do nome (kebab-case), `is_system = false`. **Nota**: como categorias hoje são por `user_id` (não `workspace_id`), verificar se o schema da Fase 1 já adicionou `workspace_id` — se sim, o `set_default_workspace_id` trigger já preenche pelo header `x-workspace-id`. Nenhuma mudança de schema aqui.

### 4) Isolamento

Nada muda: Fase 1 já adicionou `workspace_id` + trigger `set_default_workspace_id` que lê `x-workspace-id`, e o middleware `attachWorkspaceHeader` já envia o header. Trocar o workspace ativo antes de gravar identity/categorias/número garante que tudo cai no novo workspace.

### 5) Testes / validação

- `bun run test:agent` — 41 testes devem continuar passando (nenhuma mudança em `ai.server.ts`).
- Manual conforme roteiro do usuário (criar "Smoke Music", verificar isolamento, voltar para Mind).

## Arquivos

- editar `src/components/WorkspaceSwitcher.tsx`
- criar `src/components/CreateWorkspaceWizard.tsx`
- editar `src/lib/workspaces.functions.ts` (+ `createWorkspace`)
- editar `src/lib/categories.functions.ts` (+ `bulkCreateCategories`)

Sem migração nova. Aprovar para eu executar.
