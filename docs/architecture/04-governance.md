# Governança do CMS — V3

## Objetivo
Regras pra manter a arquitetura de módulos consistente conforme o projeto cresce, evitando a regressão que já aconteceu antes (módulos carregando cedo demais por configuração genérica no CMS).

## Knowledge Types oficiais

| Tipo | O que é |
|---|---|
| `base` | Contexto geral de uma plataforma/domínio |
| `education` | Explica um conceito ou como algo funciona |
| `catalog` | Lista serviços/produtos disponíveis |
| `pricing` | Valores e tabela de preços |
| `promotion` | Descontos, promoções ativas |
| `delivery` | Prazo e forma de entrega |
| `support` | Orientação de suporte/resolução de problema |
| `policy` | Regras/políticas que não são suporte nem preço (ex: segurança, comprovante) |
| `exception` | Garantias, exceções à regra geral |
| `flow` | Condução de conversa — discovery, qualification, objection, closing, onboarding. Exclusivo do domínio `SALES`, nunca usado em `PLATFORMS`/`GLOBAL`. |
| `exception` | Garantias, casos especiais, exceções à regra geral |

## Regras de governança

1. **Todo módulo novo precisa ter `domain` e `knowledge_type` definidos antes de ir pro CMS** (ver `01-cms-architecture.md` e este documento).
2. **Módulos de domínio `PLATFORMS` seguem o padrão de 8 camadas** (ver `02-platform-standard.md`) — nunca misturam mais de um `knowledge_type` no mesmo módulo.
3. **`selector_stages` genérico demais (ex: `qualificacao`) nunca deve ser o único critério de carregamento de um módulo fora do domínio `CORE`/`SALES`.** Esse foi exatamente o tipo de configuração que causou carregamento precoce de módulos de plataforma/segurança no passado.
4. **Toda mudança de `selector_*` num módulo já em produção deve ser testada com o log `[MODULE SELECTOR]`/`[MODULE FILTER]` antes de publicar**, comparando o comportamento antes/depois pra uma mensagem de teste real.
5. **Módulos `always_load: true` são reservados pro domínio `CORE`.** Qualquer outro domínio pedindo `always_load` deve ser questionado — provavelmente deveria ser `selector_triggers`/`selector_platforms` específico.

## Status desta versão
Regras documentadas. Nenhuma delas é hoje **imposta automaticamente** pelo código (não existe validação que impeça alguém de marcar `always_load: true` num módulo de `PLATFORMS`, por exemplo) — são diretrizes de processo, não travas técnicas. Automatizar essas regras (ex: validação na hora de salvar um módulo no admin) é trabalho de sprint futura.
