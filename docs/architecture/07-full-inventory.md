# Inventário Completo do CMS — Sprint 2A.1

## Status
**Completo.** 26 módulos confirmados por query real, executada em produção (workspace Mind). Este documento é **só inventário** — nenhuma classificação (`domain`/`platform`/`knowledge_type`) ainda, conforme escopo da Sprint 2A.1.

## Observação técnica importante
A coluna `source` **não existe** no schema atual (erro `42703` na query original). O documento `06-module-classification.md` (Sprint 2A parcial anterior) menciona `source: database` — isso vem do JSON do `rawPrompt` em tempo de execução (um campo montado no runtime), não de uma coluna real da tabela. Corrigir essa referência é uma pendência de documentação.

## Inventário (26 módulos)

| ID | Nome | Ativo | Prioridade | Triggers | Always Load | Versão | Atualizado em |
|---|---|---|---|---|---|---|---|
| spotify_precos | Spotify — Preços | true | 95 | preço, valor, quanto custa, mil... | false | 1 | 2026-07-24 |
| spotify_playlists | Spotify — Playlists | true | 94 | playlist, eclética, gênero... | false | 3 | 2026-07-25 |
| spotify_garantia | Spotify — Garantia | true | 93 | garantia, reposição, vitalícia... | false | 1 | 2026-07-24 |
| spotify_ouvintes | Spotify — Plays e Ouvintes | true | 92 | ouvinte mensal, 28 dias... | false | 1 | 2026-07-24 |
| spotify_links | Spotify — Links e Distribuição | true | 91 | link, álbum, artista, faixa... | false | 1 | 2026-07-24 |
| seguranca_pix | Segurança Pix | true | 90 | golpe, fraude, suspeita, bloqueado... | false | 1 | 2026-07-28 |
| spotify_prazos | Spotify — Prazos e Atualização | true | 90 | prazo, demora, 72 horas... | false | 1 | 2026-07-24 |
| youtube_servicos | YouTube — Serviços e Preços | true | 90 | yt, views, likes, inscritos... | false | 1 | 2026-07-24 |
| spotify_royalties | Spotify — Royalties | true | 89 | royalty, monetização, receber... | false | 1 | 2026-07-24 |
| spotify_servicos | Spotify — Serviços | true | 82 | *(vazio)* | false | 1 | 2026-07-24 |
| youtube_geral | YouTube — Geral | true | 82 | *(vazio)* | false | 1 | 2026-07-24 |
| youtube_links | YouTube — Links e Orientação | true | 82 | link, vídeo, canal... | false | 1 | 2026-07-24 |
| como_comprar_no_painel | Como Comprar no Painel | true | 50 | *(vazio)* | false | 3 | 2026-07-22 |
| comportamento_humano | Comportamento humano | true | 50 | *(vazio)* | false | 3 | 2026-07-28 |
| facebook | Facebook | true | 50 | *(vazio)* | false | 2 | 2026-07-22 |
| fluxo_vendas | Fluxo de Vendas | true | 50 | *(vazio)* | false | 3 | 2026-07-22 |
| identidade | Identidade | true | 50 | *(vazio)* | false | 4 | 2026-07-22 |
| instagram | Instagram | true | 50 | *(vazio)* | false | 2 | 2026-07-22 |
| kwai | Kwai | true | 50 | *(vazio)* | false | 2 | 2026-07-22 |
| objecoes_vendas | Objeções de Vendas | true | 50 | *(vazio)* | false | 2 | 2026-07-22 |
| pagamento | Pagamento | true | 50 | *(vazio)* | false | 2 | 2026-07-22 |
| regras_gerais | Regras Gerais | true | 50 | *(vazio)* | false | 3 | 2026-07-22 |
| soundcloud | SoundCloud | true | 50 | *(vazio)* | false | 2 | 2026-07-22 |
| threads | Threads | true | 50 | *(vazio)* | false | 2 | 2026-07-22 |
| tiktok | TikTok | true | 50 | *(vazio)* | false | 2 | 2026-07-22 |
| twitter | Twitter (X) | true | 50 | *(vazio)* | false | 2 | 2026-07-22 |

## Observações relevantes (sem decidir nada — só reportando o que os dados mostram)

1. **Nenhum módulo tem `always_load: true`.** Isso é diferente do que o código-fonte sugere (o `orchestrator.server.ts` força `identidade` e `regras_gerais` como obrigatórios via fallback de código, não via `always_load` do banco — confirma o que já havia sido levantado na Sprint 2A anterior).

2. **16 dos 26 módulos têm `selector_triggers` vazio.** Isso inclui `identidade`, `regras_gerais`, `fluxo_vendas`, `pagamento`, `objecoes_vendas`, `comportamento_humano`, `como_comprar_no_painel`, e **todas as redes sociais além de Spotify/YouTube** (`instagram`, `tiktok`, `kwai`, `facebook`, `soundcloud`, `threads`, `twitter`). Isso significa que esses módulos só podem carregar por `selector_stages`, `selector_intents`, `selector_platforms`/`selector_products`, ou pelo fallback de código — **essa query não trouxe esses campos**, então não dá pra saber ainda o mecanismo exato de carregamento desses 16 módulos.

3. **`spotify_royalties` existe de fato** — isso confirma um módulo que havia sido citado (em relatório anterior não totalmente verificado) mas nunca visto em dado real até agora.

4. **Existem módulos de rede social nunca mencionados antes nesta investigação:** `facebook`, `instagram`, `kwai`, `soundcloud`, `threads`, `tiktok`, `twitter` — nenhum desses tinha aparecido em nenhuma auditoria anterior (o foco sempre foi Spotify/YouTube). Isso expande consideravelmente o escopo real do CMS.

5. **Prioridade 50 é o valor padrão/genérico** — 15 dos 26 módulos compartilham exatamente essa prioridade, sugerindo que nunca foi customizada para eles.

## Próximo passo
Este inventário está completo para os campos pedidos (Nome, ID, Ativo, Prioridade, Triggers, Always Load, Versão, Atualizado em). Falta, pra Sprint 2A.2 (classificação), uma query complementar trazendo `selector_platforms`, `selector_products`, `selector_stages`, `selector_intents` de cada um dos 26 — sem isso, não dá pra classificar com segurança os 16 módulos sem trigger.
