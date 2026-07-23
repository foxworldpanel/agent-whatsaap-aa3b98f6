# Checkpoint — CMS Source-Only Routing

Base: `agent-whatsaap-aa3b98f6-main(23).zip`

## Correções

1. Removida a lista hardcoded de plataformas classificadas como `outra` (Twitter/X, Threads, Telegram, Twitch e SoundCloud). Plataformas fora das categorias técnicas conhecidas deixam de ativar módulos genéricos por código; podem continuar sendo roteadas explicitamente por gatilhos configurados no CMS.
2. Gatilhos `selector_triggers` agora usam correspondência por palavra/frase inteira, evitando falsos positivos de substring (ex.: `face` dentro de `interface`).
3. A regra anti-invenção no orchestrator deixou de nomear categorias comerciais específicas no código e passou a ser totalmente genérica: nenhuma plataforma/produto/serviço ausente dos módulos carregados pode ser oferecido.
4. Adicionados testes de regressão para plataformas não configuradas e para gatilhos de CMS por palavra inteira.

## Arquivos alterados

- `src/lib/agent-v3/selector/module-selector.server.ts`
- `src/lib/agent-v3/orchestrator.server.ts`
- `tests/agent-v3/module-selector-v3.test.ts`
