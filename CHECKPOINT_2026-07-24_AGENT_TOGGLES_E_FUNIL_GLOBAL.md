# Checkpoint — Toggles do agente + funil para todos os contatos

## Semântica final

### Chave global (sidebar)

É um **master switch**:
- ON: o Agent V3 pode responder nas conversas cujo toggle individual esteja ON.
- OFF: o Agent V3 não responde em nenhuma conversa.
- Ligar/desligar globalmente não apaga nem sobrescreve a preferência individual de cada conversa.

### Chave individual (Conversa)

Continua persistindo `conversations.agent_enabled`:
- ON: conversa liberada para a IA quando o master global também estiver ON.
- OFF: a Júlia não responde naquela conversa.

Conversas normais novas nascem com `agent_enabled = true`.
A migration também liga conversas existentes que não estejam bloqueadas ou marcadas para revisão.

### Funil

O funil agora roda **antes** dos gates global/individual do Agent V3.

Consequência:
- qualquer contato que chamar no número correto e bater no gatilho recebe o funil,
  mesmo que a IA global esteja desligada ou aquela conversa esteja com a IA individual desligada;
- durante o funil, a IA fica bloqueada;
- o turno do gatilho termina após o funil;
- nas mensagens seguintes, a Júlia assume somente se global ON + conversa ON.

Gatilho recomendado:
`Olá! Tenho interesse em divulgar minha música`

A comparação do funil já normaliza caixa/acentos e procura o gatilho dentro da mensagem.

## Proteções preservadas

- uma execução por contato/funil;
- claim persistente contra duplicidade;
- status running/completed/failed;
- funil completo antes do Agent V3;
- opt-out/bloqueio não é reativado pela migration de defaults.
