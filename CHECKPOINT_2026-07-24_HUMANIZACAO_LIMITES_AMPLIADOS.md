# Checkpoint — limites ampliados em Tempo e Humanização

Agora o painel aceita:
- atraso mínimo/máximo da resposta: 0 a 120 segundos;
- intervalo mínimo/máximo entre partes: 0 a 30 segundos.

A alteração foi aplicada de forma consistente em:
- validação Zod;
- normalizador/runtime;
- inputs da interface;
- constraints do banco via migration.

Os presets atuais permanecem os mesmos; apenas o teto configurável foi ampliado.
