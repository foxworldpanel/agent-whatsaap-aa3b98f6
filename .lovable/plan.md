# Deletar TESTE-ISO + Wizard de Criação de Workspace

## 1. Remoção do workspace TESTE-ISO
Migração de dados (via insert tool):
- Confirma que TESTE-ISO não tem números, conversas, contatos, mensagens, blast_campaigns próprios.
- `DELETE FROM public.workspaces WHERE nome = 'TESTE-ISO' AND user_id = <dono>` (via cascade limpa filhos vazios).
- Remove também a linha de debug temporária adicionada em `numeros.tsx` (do turno anterior).

## 2. Server functions novas em `src/lib/workspaces.functions.ts`

- **`createWorkspace({ nome, icone?, cor? })`** — insere workspace novo (não-default), retorna `{ id, nome }`. Usa `withWorkspaceScope` só pra pegar `userId`, mas **não** força `x-workspace-id` (é criação).
- **`deleteWorkspace({ id })`** — bloqueia se `is_default=true`; deleta workspace (cascade cuida do resto).

Categoria inicial é criada via `contact_categories` (já tem `createCategory` em `src/lib/categories.functions.ts` — reaproveitar).

## 3. Wizard UI

Novo componente: `src/components/CreateWorkspaceWizard.tsx` — Dialog com 4 passos e stepper.

```
Passo 1 — Nome
  [input "Nome do workspace"] + [ícone emoji opcional]
Passo 2 — Números do WhatsApp
  Explica: "Você pode conectar agora ou depois na tela Números."
  Ação principal: "Pular por agora e conectar depois" (leva direto pra tela Números após finalizar)
  (não replica o fluxo de conexão inteiro — reutiliza a tela Números já ativa no novo workspace)
Passo 3 — Identidade do agente
  Mostra 3 campos BRAND vazios: persona, terminologia_redes, exemplo_disparo (textareas).
  Toggle: [ ] "Usar template Mind como ponto de partida (editável)"
    → quando marcado, chama `seedMindBrand({ workspaceId })` no submit final.
  Se preencher manual, salva via `updateAgentIdentity` no submit final.
Passo 4 — Categoria inicial
  Lista com uma categoria default sugerida ("Leads") + botão "+ adicionar outra".
  Cada linha: nome, emoji, cor (ou só nome pra simplificar).
```

Fluxo do submit final:
1. `createWorkspace({ nome, icone })` → recebe `workspaceId`.
2. `switchWorkspace(workspaceId)` no contexto (para próximas chamadas irem com header correto).
3. Se toggle "usar template Mind" marcado: `seedMindBrand()`. Senão: `updateAgentIdentity({ persona, terminologia_redes, exemplo_disparo })` com o que foi digitado.
4. Para cada categoria: `createCategory({ nome, cor, icone })`.
5. Fecha modal, toast "Workspace criado!", `router.invalidate()`.

## 4. Botão no `WorkspaceSwitcher`
Adiciona `DropdownMenuItem` "+ Criar novo workspace" abaixo da lista, abre o wizard.

## 5. Validação
- `bun run test:agent` → 46/46 (não mexemos em ai.server nem tests).
- Manual smoke: criar TESTE-ISO-2 pelo wizard, confirmar telas vazias, voltar pra Mind confirmar tudo intacto.
- Após validado, aviso o usuário pra criar a Smoke Music de verdade.

## Arquivos alterados/criados
- `supabase migration` — DELETE de TESTE-ISO (via insert tool).
- `src/lib/workspaces.functions.ts` — adiciona `createWorkspace`, `deleteWorkspace`.
- `src/components/CreateWorkspaceWizard.tsx` — **novo**.
- `src/components/WorkspaceSwitcher.tsx` — botão "+ Criar novo workspace".
- `src/routes/_authenticated/numeros.tsx` — remove linha de debug temporária.

Confirma pra eu executar?
