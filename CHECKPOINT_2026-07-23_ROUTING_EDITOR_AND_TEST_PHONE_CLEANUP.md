# Checkpoint — Routing editor + limpeza do telefone de teste

## Corrigido

- O CMS já permitia criar, editar e excluir módulos, mas não expunha os metadados usados pelo seletor V3.
- A tela do Agente agora permite editar `enabled`, `always_load`, prioridade, plataformas, intenções, estágios, produtos, gatilhos, dependências e conflitos.
- O botão **Salvar Alterações** persiste conteúdo e roteamento no mesmo update, invalidando o cache do workspace pelo fluxo existente.
- Foi adicionada uma migration consolidada para remover memória V3 e conversas/runtime legados ligados ao telefone de teste `5511970116430`/`11970116430`, preservando o cadastro do contato.

## Por que isso importa

Um módulo novo sem metadados podia existir no CMS mas nunca ser selecionado pelo runtime, salvo casos de fallback por chave da plataforma. Agora o administrador consegue configurar diretamente quando cada módulo deve entrar no prompt.

## Validação disponível neste ambiente

- Revisão estática do fluxo CMS -> loader -> selector -> prompt builder -> orchestrator.
- `npm test` ainda não pôde rodar porque o ZIP não contém `node_modules` e a instalação de dependências excedeu o limite do ambiente.
