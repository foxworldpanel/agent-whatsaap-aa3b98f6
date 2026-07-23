# Checkpoint — Hardcode Tombstone

Base: `agent-whatsaap-aa3b98f6-main(28).zip`

## Problema confirmado

O arquivo `src/lib/agent-v3/brain/global-config.server.ts` reapareceu no GitHub contendo `mindsmmpanel.com`, apesar do checkpoint anterior indicar que ele havia sido removido.

A causa operacional provável é a atualização do projeto por cópia/substituição de arquivos: um arquivo removido no checkpoint não é necessariamente apagado no repositório de destino.

## Correção

O arquivo legado foi transformado em um *tombstone* de compatibilidade: ele permanece fisicamente no projeto, mas não exporta configuração e não contém URL, oferta ou dado comercial.

Isso faz com que futuras atualizações por substituição sobrescrevam a versão antiga em vez de depender de uma exclusão manual.

## Validação

- `src/lib/agent-v3` não contém `mindsmmpanel.com`.
- `src/lib/agent-v3` não contém `VERBOSE_LOOP_FAREWELL`.
- `src/lib/agent-v3` não contém declaração/uso de `GLOBAL_V3_CONFIG`.
- O teste `tests/agent-v3/no-commercial-hardcodes.test.ts` permanece compatível com a correção.
