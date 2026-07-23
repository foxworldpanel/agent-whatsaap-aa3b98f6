# Checkpoint — Knowledge Base Workspace Isolation

Base: `agent-whatsaap-aa3b98f6-main(29).zip`

## Bug confirmado

As operações da `knowledge_base` usavam apenas `user_id`, apesar de o middleware já fornecer `workspaceId` e a tabela possuir a coluna `workspace_id`.

Em contas com mais de um workspace, isso permitia:

- listar exemplos de conhecimento pertencentes a outro workspace do mesmo usuário;
- aplicar o limite de 50 exemplos somando workspaces diferentes;
- inserir exemplos sem declarar explicitamente o workspace ativo;
- excluir por `id + user_id` sem reforçar o isolamento do workspace atual.

## Correção

`src/lib/knowledge-base.functions.ts` agora:

- filtra listagem por `user_id + workspace_id`;
- calcula o limite por `user_id + workspace_id`;
- grava `workspace_id` explicitamente em exemplos de texto e imagem;
- exige `workspace_id` também na exclusão.

## Teste de regressão

Adicionado `tests/knowledge-base-workspace-isolation.test.ts` para impedir remoção acidental do escopo por workspace.

## Observação arquitetural

A auditoria também confirmou que o runtime atual do Agent V3 usa `agent_modules_v3` como fonte comportamental do prompt. A tabela `knowledge_base` permanece uma área separada/legada de exemplos e não é automaticamente injetada no prompt V3 nesta versão.
