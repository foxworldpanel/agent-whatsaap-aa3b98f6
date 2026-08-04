# Padrão Oficial de Módulos de Plataforma

## Objetivo
Define a estrutura editorial que todo módulo do domínio `PLATFORMS` deve seguir. Garante que cada módulo tenha uma única responsabilidade, evitando módulos "genéricos demais" que misturam preço, garantia e explicação no mesmo texto.

## As 8 camadas

| Camada | Conteúdo | Pergunta que responde |
|---|---|---|
| `platform.base` | O que a plataforma é, contexto geral | "O que vocês fazem no Spotify?" |
| `platform.education` | Como o serviço funciona, conceitos | "Como funciona o play automático?" |
| `platform.catalog` | Lista de serviços disponíveis | "Quais serviços vocês têm pro Spotify?" |
| `platform.pricing` | Valores, tabela de preços | "Quanto custa 1000 plays?" |
| `platform.promotions` | Promoções e descontos ativos | "Tem desconto?" |
| `platform.links` | Formato de link aceito, como validar | "Que link eu mando?" |
| `platform.delivery` | Prazo, forma de entrega | "Quando começa a entregar?" |
| `platform.exceptions` | Garantias, exceções, casos especiais | "Se cair, tem reposição?" |

## Ordem editorial (não é ordem de carregamento)

```
base → education → catalog → pricing → promotions → links → delivery → exceptions
```

Essa é a ordem em que um humano leria pra entender a plataforma do zero — usada só como guia de organização do conteúdo, não define a ordem real de seleção pelo Module Selector.

## Regra de ouro
Um módulo cobre **uma única camada**. Um módulo que mistura preço com garantia deveria virar dois módulos (`platform.pricing` + `platform.exceptions`).

## Status desta versão
Padrão oficial, ainda **não aplicado** aos módulos existentes (ex: hoje `Spotify — Garantia` mistura conceito de garantia geral com exceções específicas, o que no padrão viraria só `platform.exceptions`). Migração é sprint futura.
