# Checkpoint — precisão do seletor de intenção

Base: `agent-whatsaap-aa3b98f6-main(22).zip`

## Correções

- Gatilhos agora respeitam palavras/frases inteiras em vez de substrings. Isso evita falsos positivos como `face` dentro de `interface`.
- A palavra isolada `pedido` deixou de classificar qualquer intenção como suporte. Foram mantidos sinais específicos de pós-venda, como `meu pedido`, `status do pedido`, `pedido pendente` e `pedido em andamento`.
- A palavra isolada `quanto` deixou de ser sinal suficiente de preço, evitando classificar `quanto tempo demora?` como consulta de preço.
- Corrigidos imports obsoletos em `tests/v3/module-selector-cms.test.ts`, que ainda apontavam para caminhos anteriores à reorganização das pastas V3.
- Adicionados testes de regressão para compra vs. suporte, prazo vs. preço e falsos positivos de plataforma.

## Validação

A estrutura do ZIP foi validada após recompactação. A suíte Vitest não foi executada porque a base recebida não contém `node_modules`.
