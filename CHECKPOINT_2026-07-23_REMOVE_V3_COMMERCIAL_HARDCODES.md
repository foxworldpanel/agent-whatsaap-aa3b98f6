# Checkpoint — Remove V3 Commercial Hardcodes

Base: `agent-whatsaap-aa3b98f6-main(27).zip`

## Correções

- Removido `GLOBAL_V3_CONFIG.panel_url = "mindsmmpanel.com"`, que estava morto e contrariava a regra de CMS como fonte única.
- Removida `VERBOSE_LOOP_FAREWELL`, resposta comercial fixa ainda presente em `brain/guards.server.ts`, mesmo após o orquestrador ter deixado de usá-la.
- Removido `looksLikeConcreteAction` da V3, função sem consumidores no runtime V3 e remanescente do guard legado.
- Adicionado teste de regressão para impedir a reintrodução de URL comercial ou canned reply dentro de `src/lib/agent-v3`.

## Impacto

O runtime V3 deixa de carregar artefatos comerciais fixos da Mind no código. Links, serviços e ofertas devem vir dos módulos do CMS selecionados para a conversa.

## Validação

- Busca estática em `src/lib/agent-v3` sem ocorrência de `mindsmmpanel.com`, `VERBOSE_LOOP_FAREWELL` ou `GLOBAL_V3_CONFIG`.
- ZIP validado estruturalmente.
- Vitest não executado nesta cópia porque `node_modules` não acompanha o ZIP recebido.
