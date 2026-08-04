# Arquitetura do CMS — V3

## Objetivo
Este documento define os domínios oficiais dos módulos do CMS (`agent_modules_v3`). É a referência única pra classificar qualquer módulo novo ou existente.

## Domínios

| Domínio | Responsabilidade | Exemplos hoje |
|---|---|---|
| **CORE** | Identidade e regras universais do agente — sempre carregam | Identidade, Regras Gerais |
| **GLOBAL** | Regras de negócio que atravessam qualquer plataforma/produto | Segurança Pix, Como Usar Painel |
| **SALES** | Condução comercial da conversa (fluxo, qualificação, fechamento) | Fluxo de Vendas |
| **PLATFORMS** | Conhecimento específico de uma rede social | Spotify — Preços, Spotify — Garantia, Spotify — Links |
| **ADMIN** | Módulos de suporte operacional/interno, não voltados à venda | Suporte |

## Regra de ouro
Um módulo pertence a exatamente **um** domínio. Todo conhecimento compartilhado entre plataformas pertence ao domínio `GLOBAL`. Apenas regras ou comportamentos exclusivos de uma plataforma permanecem em `PLATFORMS`.

## Status desta versão
Esta é a taxonomia **oficial**, mas os módulos existentes ainda **não foram migrados** pra ela — o campo `domain` ainda não existe na tabela `agent_modules_v3`. A migração de dados é uma sprint futura, separada desta.
