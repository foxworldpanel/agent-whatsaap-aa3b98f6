# Checkpoint — Agent V3 não respondendo no WhatsApp

Foram corrigidos dois gates inconsistentes:

1. `agent_config` ausente:
   - a UI mostrava ON;
   - o webhook tratava como OFF.
   Agora ausência de configuração significa ON por padrão. Apenas `false` explícito desliga.

2. `needs_review`:
   - antes funcionava como kill switch invisível;
   - uma falha técnica antiga podia impedir todas as respostas futuras.
   Agora `needs_review` continua disponível para auditoria, mas não desliga a IA.

Fonte de verdade:
- master global: `agent_config.agent_enabled`;
- conversa individual: `conversations.agent_enabled`.

Opt-out e bloqueio manual continuam seguros porque gravam `agent_enabled = false`.

A migration também limpa o estado técnico antigo do telefone de teste 5511970116430.
