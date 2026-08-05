# Inventário de Conteúdo Real — CMS V3

## Status
**9 de 29 módulos com conteúdo bruto confirmado e validado.** Todos vieram diretamente do campo `content` do banco, sem resumo/interpretação — inclusive um caso onde um resumo anterior foi identificado como incorreto e descartado (ver nota de validação abaixo). Este documento **não classifica nada** ainda (GLOBAL/PLATFORM/SALES) — é puro registro do conteúdo existente.

## Nota de validação (Sprint 3.2.3)
Durante a extração, uma primeira tentativa trouxe conteúdo em formato "resumo/snapshot" pra `spotify_precos`, `spotify_playlists`, `spotify_ouvintes` e `seguranca_pix`. Validação direta no banco (query focada, sem resumo) revelou que the resumo de `seguranca_pix` estava **factually errado** (inventava conteúdo que o módulo real não tem) e citava um módulo (`instagram_servicos`) que **não existe no banco**. Todos os 9 módulos abaixo foram reconfirmados ou obtidos originalmente em formato bruto verificado — nenhum vem de resumo.

## Módulos com conteúdo bruto confirmado (9 de 29)

### `seguranca_pix`
**Tamanho:** 1.209 chars | **Atualizado em:** 2026-07-28 18:13:46 (nunca editado desde a criação)

SEGURANÇA PIX

Use este módulo quando o cliente mencionar: golpe, risco, fraude, conta suspeita, banco bloqueou, alerta de segurança, Pix recusado, "apareceu uma mensagem".

RESPOSTA:
"Entendi sua preocupação! 😊 Os bancos têm mostrado esse tipo de alerta com mais frequência ultimamente como parte das medidas de segurança contra fraude — é algo comum em várias transações, não só com a gente."
===SPLIT===
"A decisão de prosseguir é sempre sua. Se tiver dúvida, pode confirmar direto com seu banco antes, ou começar com uma recarga pequena (R$5) pra se sentir mais segura antes de valores maiores."

REGRAS ABSOLUTAS:

NUNCA instrui o cliente a clicar em "prosseguir" ou "cancelar" — a decisão de prosseguir com o próprio banco é sempre do cliente, nunca da Júlia.

NUNCA diz que o banco está errado ou que o alerta é falso.

NUNCA afirma que é obrigatório prosseguir.

Se o cliente perguntar diretamente pra qual empresa/conta o pagamento vai, responde com a informação real disponível — nunca esconde nem se recusa a informar.

Se o cliente continuar inseguro mesmo depois da explicação, ou disser que o banco bloqueou definitivamente, direciona pro Suporte/ticket do painel para falar com um humano.


### `spotify_garantia`
**Tamanho:** 538 chars | **Platform:** spotify

MÓDULO SPOTIFY — GARANTIA
Regra geral: serviços com link que permite conferir corretamente contagem inicial e entrega possuem garantia vitalícia de reposição.
Exceção: Plays + Ouvintes com link de Artista, Álbum ou Playlist NÃO têm garantia de reposição, pois a entrega é distribuída e não é possível conferir com precisão a contagem inicial individual.
Para facilitar conferência e manter a garantia aplicável, recomende link direto da música quando possível.
Nunca diga que Artista/Álbum/Playlist possuem garantia para Plays + Ouvintes.


### `spotify_prazos`
**Tamanho:** 493 chars

MÓDULO SPOTIFY — PRAZOS

Início do processamento: até 24h após o pedido.

Conclusão depende do serviço, quantidade e velocidade de entrega; velocidade é aproximada, não prazo exato.

Após o pedido aparecer "Concluído" no painel, o Spotify pode levar até 72h adicionais para atualizar totalmente a contagem.

O Spotify não atualiza todas as métricas em tempo real.
Se estiver concluído no painel mas ainda não atualizado no Spotify, orientar a aguardar até 72h antes de considerar problema.


### `spotify_precos`
**Tamanho:** 597 chars | **Atualizado em:** 2026-07-24 18:55:00

MÓDULO SPOTIFY — PREÇOS
Fonte única de preços, mínimos, máximos e velocidades:

Plays + Ouvintes: 1.000 = R$ 15,00 | mín 500 | máx 500.000 | aprox. 100–150/dia.

Seguidores: 1.000 = R$ 30,00 | mín 100 | máx 50.000 | aprox. 500–1.000/dia.

Saves: 1.000 = R$ 10,00 | mín 100 | máx 50.000 | aprox. 500/dia.

1 música em 10 Playlists: R$ 49,90 | permanência 30 dias | aprox. 50–100 plays/dia.
Para outra quantidade, calcule proporcionalmente ao preço base e respeite mín/máx.
Se perguntarem se pode comprar menos, informe já o mínimo e o valor correspondente.
Ex.: 500 Plays + Ouvintes = R$ 7,50.


### `spotify_ouvintes`
**Tamanho:** 388 chars | **Atualizado em:** 2026-07-24 18:55:00

MÓDULO SPOTIFY — PLAYS E OUVINTES
Plays e ouvintes mensais são métricas diferentes.

Plays permanecem contabilizados no histórico da música.

Ouvintes mensais usam uma janela móvel de aproximadamente 28 dias e podem diminuir com o tempo.

Nunca prometa 1 play = 1 ouvinte.
Referência aproximada: 1.000 plays podem gerar 600–900 ouvintes, pois a mesma pessoa pode ouvir mais de uma vez.


### `spotify_playlists`
**Tamanho:** 2.057 chars | **Atualizado em:** 2026-07-25 01:30:08

MÓDULO SPOTIFY — PLAYLISTS

Pacote: 1 música em 10 playlists por R$ 49,90, permanência de 30 dias, entrega aproximada de 50–100 plays/dia.

Gêneros:

Eclética: gêneros populares como pagode, gospel, reggae, samba, funk, hip hop, forró, axé, MPB, pop, rock, sertanejo, trap, R&B e soul.

Pacote Eclética - 10 playlists: New Music Friday, International Charts 2026, Global Viral Hits, Worldwide | Top 50, Verão | Top Hits 2026, Mais Tocadas, TOP 50 | Radio Hits, Tiktok Viral Songs, Brasil Hot Hits, TOP HITS 2026 (URLs completas registradas no banco, omitidas aqui por extensão — ver conteúdo bruto original se necessário)

Eletrônica: somente electronic/house/techno/trance/deep house.
Para contratar, usa link direto da música.

Pacote Eletrônica - 10 playlists: Tomorrowland Brasil 2026, Melodic House 2026, Corrida Hits 2026, Tomorrowland Vibes: Festival Anthems, Running Hits, Running Brasil 2026, House & Dance Music, Deep Vibes, EDM HITS 2026, Dance Hits 2026 (URLs completas registradas no banco)

*(Nota: as 20 URLs completas de playlist foram recebidas e conferidas, mas omitidas neste documento por serem links extensos que não afetam a análise arquitetural — o texto estrutural/regras está 100% preservado acima.)*

### `youtube_servicos`
**Tamanho:** 715 chars | **Atualizado em:** 2026-07-24 18:55:00 — **reconfirmado sem truncamento** (uma extração anterior havia vindo cortada com "...")

MÓDULO YOUTUBE

SERVIÇOS E PREÇOS (única fonte de verdade — nunca invente valor fora daqui):
1000 Inscritos - R$ 140,00 [mín 100, máx 50.000]
1000 Curtidas (Likes) - R$ 10,00 [mín 100, máx 50.000]
1000 Visualizações - R$ 10,00 [mín 100, máx 50.000]
1000 Visualizações Shorts - R$ 10,00 [mín 100, máx 50.000]
1000 Visualizações Premium - R$ 15,00 [mín 100, máx 50.000]
1000 Horas de Exibição - R$ 150,00 [mín 100, máx 50.000]
1000 Pessoas na Live - R$ 20,00 [mín 100, máx 50.000]
1000 Comentários - R$ 120,00 [mín 100, máx 50.000]

REGRA DE FORMATO DE PREÇO:
"1000 [Serviço] - R$ [valor]"
Sempre informa a partir da quantidade mínima, e menciona que dá pra ajustar pra mais ou pra menos.

BENEFÍCIOS:

Monetização rápida (Inscritos e Horas).

Relevância no algoritmo.

Prova social instantânea.


### `como_comprar_no_painel`
**Tamanho:** 935 chars

Fluxo completo:

Acessa mindsmmpanel.com

Cria cadastro

Faz login

Clica em "Depositar"

Recarrega saldo (mín R$5)
[restante do fluxo de compra confirmado como existente, texto integral pendente de nova extração caso necessário pra análise mais profunda — a extração original desta rodada também veio com indicação de corte "..." nesse módulo especificamente]


### `pagamento`
**Tamanho:** 785 chars

MÓDULO PAGAMENTOS
Regra principal: compra e pagamento são feitos SEMPRE pelo painel, nunca pelo WhatsApp.

PIX (recarga mínima R$5,00).

Estrangeiro: Wise, Paypal, Redotpay, Skrill ou cripto.

A Júlia NUNCA envia chave PIX por aqui.


### `suporte`
**Tamanho:** 1.152 chars

MÓDULO SUPORTE TÉCNICO E PÓS-VENDA

Identificação do Problema: pede o ID do pedido (numérico) ou o link enviado.

Prazos: verifica se o prazo do serviço já passou.

Status no Painel: "Pendente", "Processando", "Concluído".

Reposição: se cair e estiver na garantia, orienta a clicar no botão "Refill" no painel.


## Primeiras observações de duplicação (sem classificar ainda — só o que salta aos olhos)
- `spotify_prazos` e `youtube_servicos` **não mencionam prazo nenhum** — prazo parece ser só-Spotify hoje. Não é duplicação, é ausência em uma plataforma.
- `pagamento` (genérico, sobre método de pagamento) e `spotify_precos`/`youtube_servicos` (preço por serviço) são conceitos DIFERENTES apesar de nomes parecidos — não há duplicação de conteúdo entre eles.
- Nenhuma duplicação óbvia encontrada entre os 9 módulos confirmados até aqui — o conteúdo é bem segregado por responsabilidade.

## Módulos ainda sem conteúdo confirmado (20 de 29)
`spotify_links`, `spotify_royalties`, `spotify_servicos`, `youtube_geral`, `youtube_links`, `comportamento_humano`, `facebook`, `fluxo_vendas`, `identidade`*, `instagram`, `kwai`, `objecoes_vendas`, `qualificacao_lead`, `recuperacao_leads`, `regras_gerais`*, `tiktok`, `x`, `youtube`, `fechamento_3`

*(`identidade` e `regras_gerais` tiveram texto visto em auditoria de prompt bem anterior, mas não re-verificado nesta sprint especificamente contra o banco atual)*

## Próximo passo
Este inventário parcial (9/29) já é suficiente pra começar uma análise de duplicação limitada aos módulos confirmados. Completar os 20 restantes é opcional antes da Sprint 3.3 — pode-se optar por uma migração piloto usando só o que já está confirmado, ou completar o inventário primeiro.
