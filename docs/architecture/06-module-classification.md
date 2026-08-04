# Classificação Oficial dos Módulos — CMS V3

## Status desta classificação
**Parcial.** Cobre apenas os módulos com dados confirmados pela auditoria SQL (Query 1, rodada nesta mesma investigação). Módulos mencionados em outras partes do sistema mas nunca confirmados por query real (`payment`, `youtube_links`, `Comportamento Humano`, `Psicologia de Vendas`, `Objeções de Vendas`, `Fechamento`, `Qualificação`, entre outros vistos no painel do Playground) **não foram classificados** — ver seção "Módulos pendentes" no final.

## Inventário classificado

| Module (key) | Domain | Platform | Knowledge Type | Confiança |
|---|---|---|---|---|
| `identidade` | CORE | null | base | ✅ Alta |
| `regras_gerais` | CORE | null | base | ✅ Alta |
| `fluxo_vendas` | SALES | null | flow | ✅ Alta (resolvido — `flow` adicionado à taxonomia) |
| `seguranca_pix` | GLOBAL | null | policy | ✅ Alta |
| `spotify_precos` | PLATFORMS | spotify | pricing | ✅ Alta |
| `spotify_garantia` | PLATFORMS | spotify | exception | ✅ Alta |
| `spotify_links` | PLATFORMS | spotify | links | ✅ Alta |
| `spotify_servicos` | PLATFORMS | spotify | catalog | ✅ Alta |
| `suporte` | ADMIN | null | support | ✅ Alta |

## Casos ambíguos — registrados, não decididos automaticamente

### `fluxo_vendas` — RESOLVIDO
- Era ambíguo entre `education` e nenhum tipo adequado. **Resolvido**: `flow` foi adicionado oficialmente à taxonomia (ver `04-governance.md` atualizado), cobrindo discovery/qualification/objection/closing/onboarding. `fluxo_vendas` agora é `flow` com confiança alta.

### `seguranca_pix` — domain
- Classifiquei como `GLOBAL` (não é específico de plataforma), mas poderia ser interpretado como `PLATFORMS` com `platform: null` sendo tratado como "qualquer" em vez de "nenhuma". A taxonomia da Sprint 1 não deixa esse caso 100% claro.

## Validação de consistência

- **Total de módulos confirmados por query real:** 9
- **Módulos classificados:** 9 de 9 confirmados
- **Módulos ambíguos:** 1 (questão de domain em `seguranca_pix` — `fluxo_vendas` foi resolvido)
- **Módulos pendentes (mencionados, nunca confirmados por query):**
  - `payment` (citado no prompt da Sprint 2A, nunca visto em dado real)
  - `youtube_links` (idem)
  - `Comportamento Humano`, `Psicologia de Vendas`, `Objeções de Vendas`, `Fechamento`, `Qualificação` (vistos no painel "Controle de Módulos" do Playground, nunca confirmados por query)

## Observação arquitetural — RESOLVIDA
O `knowledge_type` `flow` foi adicionado à taxonomia oficial (Sprint 1, revisão pós-auditoria), cobrindo módulos do domínio `SALES` como `fluxo_vendas`. Não é mais uma lacuna em aberto.

## Próximo passo necessário
Antes de completar esta classificação, é preciso rodar a Query 1 completa de novo (o CMS pode ter crescido desde a última vez) e trazer o resultado real — incluindo os módulos `payment`, `youtube_links`, `Comportamento Humano`, `Psicologia de Vendas`, `Objeções de Vendas`, `Fechamento`, `Qualificação` que já sabemos existir mas nunca vimos com dado real.
