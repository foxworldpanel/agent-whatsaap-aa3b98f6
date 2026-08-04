# Classificação Oficial dos Módulos — CMS V3 (Definitiva — v3)

## Status desta versão
Baseada na extração única e consolidada de 29 módulos (a instabilidade das extrações anteriores foi explicada pelo Lovable: edições reais no banco durante a própria auditoria — `soundcloud`/`threads`/`twitter` foram renomeados/consolidados em `x`, e 3 módulos novos de funil foram criados). **Esta é a versão que substitui todas as anteriores.**

Mesmo nesta extração fresca, **14 dos 29 módulos continuam com `platforms`/`intents`/`triggers` vazios** — a classificação desses continua sendo por nome, não por dado confirmado. Isso não é mais instabilidade, é uma característica real desses módulos hoje.

## Classificação completa (29 módulos)

| Module | Domain | Platform | Knowledge Type | Confiança | Observações |
|---|---|---|---|---|---|
| spotify_precos | PLATFORMS | spotify | pricing | Alta | Intents confirmam (consulta_preco, compra) |
| spotify_playlists | PLATFORMS | spotify | catalog | Alta | Trigger confirma |
| spotify_garantia | PLATFORMS | spotify | exception | Alta | Intents confirmam (seguranca, suporte) |
| spotify_ouvintes | PLATFORMS | spotify | catalog | Média | Trigger sugere descrição de serviço |
| spotify_links | PLATFORMS | spotify | links | Alta | Trigger confirma |
| seguranca_pix | GLOBAL | null | policy | Alta | Intents confirmam (seguranca, pagamento) |
| spotify_prazos | PLATFORMS | spotify | delivery | Alta | Intents confirmam (suporte, pos_compra) |
| youtube_servicos | PLATFORMS | youtube | pricing | Média | Intents confirmam (descoberta, compra); nome mistura catalog+pricing |
| spotify_royalties | PLATFORMS | spotify | education | Alta | Trigger confirma |
| spotify_servicos | PLATFORMS | spotify | catalog | Média | Platform confirmado, sem trigger/intent |
| youtube_geral | PLATFORMS | youtube | base | Média | Platform confirmado, genérico |
| youtube_links | PLATFORMS | youtube | links | Alta | Trigger confirma |
| como_comprar_no_painel | GLOBAL | null | education | Média-Alta | Sem dado de selector, nome inequívoco |
| comportamento_humano | CORE | null | base | Média | Sem dado de selector |
| facebook | PLATFORMS | facebook | base | **Baixa** | Zero selector preenchido — não tem nem `platforms: [facebook]` |
| fluxo_vendas | SALES | null | flow | Alta | Resolvido na revisão da taxonomia |
| identidade | CORE | null | base | Alta | Confirmado por leitura direta |
| instagram | PLATFORMS | instagram | base | **Baixa** | Zero selector preenchido |
| kwai | PLATFORMS | kwai | base | **Baixa** | Zero selector preenchido |
| objecoes_vendas | SALES | null | flow | Média-Alta | Nome indica lida com objeção |
| pagamento | GLOBAL | null | policy | Média-Alta | Nome sugere política geral |
| qualificacao_lead | SALES | null | flow | Média-Alta | Módulo novo, nome indica etapa de funil |
| recuperacao_leads | SALES | null | flow | Média-Alta | Módulo novo, nome indica etapa de funil |
| regras_gerais | CORE | null | base | Alta | Confirmado por leitura direta |
| suporte | ADMIN | null | support | Média-Alta | Existe confirmado, sem selector preenchido |
| tiktok | PLATFORMS | tiktok | base | **Baixa** | Zero selector preenchido |
| x | PLATFORMS | twitter | base | **Baixa** | Substituiu `twitter`; zero selector preenchido |
| youtube | PLATFORMS | youtube | base | **Baixa** | Módulo novo, redundante com `youtube_geral`? Precisa esclarecimento |
| fechamento_3 | SALES | null | flow | Média-Alta | Módulo novo, nome indica etapa de fechamento |

## Achado crítico — ação recomendada antes da Sprint 2B

**7 módulos de plataforma (`facebook`, `instagram`, `kwai`, `tiktok`, `x`, `youtube`, e parcialmente `youtube_geral`) têm `selector_platforms` VAZIO**, mesmo sendo módulos nomeados exatamente como a plataforma. Isso significa:

1. O **filtro negativo de plataforma** que implementamos (`FILTROS-COM-STAGE-E-RESUMO.zip`) **não tem efeito nenhum sobre esses módulos**, porque o filtro só remove módulos que TÊM `selector_platforms` preenchido e não bate — módulos sem nada preenchido nunca são scoped, então nunca são removidos por esse filtro.
2. Isso sugere que esses 7 módulos **carregam por outro mecanismo** (provavelmente `stage`/`intent` genérico não capturado nessas queries, ou nunca carregam de fato — não sei qual sem mais uma auditoria específica).

**Recomendação:** antes de qualquer migração real (Sprint 2B em diante), vale rodar o log real `[MODULE SELECTOR]` numa conversa que mencione "Instagram" ou "TikTok", pra confirmar se esses módulos carregam OU NÃO — hoje isso não está provado, só suposto pelo nome.

## Resumo Executivo

### Totais por Domain
| Domain | Total |
|---|---|
| CORE | 3 |
| GLOBAL | 3 |
| SALES | 6 (fluxo_vendas, objecoes_vendas, qualificacao_lead, recuperacao_leads, fechamento_3) |
| PLATFORMS | 16 |
| ADMIN | 1 (suporte) |

### Totais por confiança
| Confiança | Total |
|---|---|
| Alta | 11 |
| Média / Média-Alta | 11 |
| Baixa | 7 (todos os módulos de plataforma sem nenhum selector preenchido) |

## Módulo `youtube` vs `youtube_geral` — pendência não resolvida
Existem 2 módulos com nomes muito parecidos (`youtube_geral`, prioridade 82, versão 1 vs `youtube`, prioridade 50, versão 1). Não sei se são redundantes, se um está sendo descontinuado, ou se têm propósitos diferentes. **Não vou presumir.** Recomendo perguntar diretamente antes da Sprint 2B.

## Candidatos à migração (Sprint 4)
- `youtube_servicos` (mistura catalog+pricing)
- Os 7 módulos de plataforma sem selector preenchido — precisam de auditoria de comportamento real antes de qualquer decisão

## Candidatos à extração GLOBAL
- `pagamento`, `como_comprar_no_painel`, `seguranca_pix` (já classificados como GLOBAL)

## Conclusão
Diferente da versão anterior, esta classificação está baseada numa extração **única e consistente** — a instabilidade foi resolvida. Mas ainda há 2 pendências reais que impedem 100% de certeza: (1) os 7 módulos de plataforma sem selector, cujo comportamento real não foi comprovado por log; (2) a duplicidade aparente `youtube` vs `youtube_geral`.
