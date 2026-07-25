# Dashboard — custo real Claude V3

Base: versão (74).

Fonte corrigida:
- antes: `agent_prompt_metrics` (legado V1/V2);
- agora: `agent_logs` com `type = agent_v3_turn`;
- usage: `metadata.usage`;
- custo: `metadata.cost`.

Métricas:
- custo Claude V3 em 24h;
- média por resposta;
- média por conversa (conversation_id único);
- input/output tokens;
- cache read/write tokens;
- custo de input/output/cache;
- taxa de leitura de cache;
- mix de modelos;
- latência média;
- média de módulos por turno.

Observação:
Whisper/OpenAI e ElevenLabs têm cobrança externa própria e não entram neste
total enquanto esses provedores não registrarem custo por chamada no runtime.
