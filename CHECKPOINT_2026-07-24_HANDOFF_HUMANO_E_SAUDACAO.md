# Checkpoint — handoff humano + saudação

Base: versão (58) enviada como última versão do GitHub.

## Handoff determinístico

Pedidos como:
- falar com atendente humano;
- falar com humano;
- quero falar com uma pessoa;
- atendente humano;
- pessoa de verdade;

são tratados antes do Claude.

Fluxo:
1. envia uma única confirmação curta;
2. grava `agent_enabled = false` apenas nessa conversa;
3. marca `needs_review = true`;
4. `review_reason = cliente solicitou atendimento humano`;
5. limpa a memória operacional do Agent V3;
6. encerra o turno;
7. mensagens seguintes não recebem resposta automática até reativação manual.

O botão individual já existente de reativação limpa `needs_review` e liga o agente novamente.

## Saudação

Primeiro cumprimento simples é padronizado sem emoji:

`Boa noite! Tudo bem? Aqui é a Júlia da Mind. Como posso te ajudar?`

O período é preservado para bom dia / boa tarde / boa noite.
