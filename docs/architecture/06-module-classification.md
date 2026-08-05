# Classificação de Módulos — Auditoria V3

## Objetivo
Este documento registra a classificação técnica de cada módulo atual da Mind seguindo a taxonomia definida em `01-cms-architecture.md`.

## Inventário e Classificação

| Módulo (ID) | Domínio | Justificativa |
|---|---|---|
| **identidade** | CORE | Define quem o agente é (Sara da Mind). |
| **regras_gerais** | CORE | Regras universais de comportamento. |
| **comportamento_humano** | CORE | Lógica de humanização e delays. |
| **seguranca_pix** | GLOBAL | Proteção contra golpes (comum a todas as vendas). |
| **como_comprar_no_painel** | GLOBAL | Tutorial de uso da plataforma. |
| **fluxo_vendas** | SALES | Estrutura de condução comercial. |
| **qualificacao_lead** | SALES | Filtro inicial de interesse. |
| **recuperacao_leads** | SALES | Follow-up de contatos parados. |
| **fechamento_3** | SALES | Etapa final de conversão. |
| **spotify_precos** | PLATFORMS | Específico da rede Spotify. |
| **spotify_garantia** | PLATFORMS | Específico da rede Spotify. |
| **youtube_servicos** | PLATFORMS | Específico da rede YouTube. |
| **instagram** | PLATFORMS | Específico da rede Instagram. |
| **suporte** | ADMIN | Atendimento não-comercial. |

## Observações de Auditoria
1. Módulos como `instagram`, `tiktok`, `kwai` e `facebook` atualmente são placeholders com prioridade 50 e devem ser expandidos ou consolidados.
2. A migração física (adição da coluna `domain` na tabela) será planejada após a validação desta lista.
