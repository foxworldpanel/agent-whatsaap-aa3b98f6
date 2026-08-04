# Roadmap — Evolução do CMS (Fase 2 em diante)

## Objetivo
Documentar a sequência de sprints planejadas para aplicar a governança definida em `01` a `04`, sem misturar "o que é arquitetura" com "quando cada coisa acontece".

## Sprint 1 — Governança (concluída)
- Documentação da taxonomia de domínios (`CORE`, `GLOBAL`, `SALES`, `PLATFORMS`, `ADMIN`)
- Documentação do padrão de plataforma (8 camadas)
- Documentação do contrato de módulo
- Documentação das regras de governança
- **Zero mudança de comportamento, runtime ou banco.**

## Sprint 2 — Migração de dados (proposta, não iniciada)
- Adicionar os campos `domain` e `knowledge_type` na tabela `agent_modules_v3` (migration aditiva, sem remover nada)
- Classificar cada módulo **existente** dentro da taxonomia oficial, preenchendo os campos novos
- Não implica mudança de comportamento — só preenche metadado novo em módulos que já existem

## Sprint 3 — Validação automática (proposta, não iniciada)
- Implementar a regra de governança #3 (`selector_stages` genérico não pode ser único critério fora de `CORE`/`SALES`) como validação no momento de salvar um módulo no admin
- Objetivo: impedir que a regressão de carregamento precoce (a que investigamos e corrigimos manualmente) volte a acontecer por configuração futura

## Sprint 4 — Reestruturação de módulos de plataforma (proposta, não iniciada)
- Aplicar o padrão de 8 camadas (`02-platform-standard.md`) aos módulos de `PLATFORMS` existentes
- Módulos que hoje misturam mais de um `knowledge_type` (ex: preço + garantia no mesmo módulo) são divididos
- Esta é a sprint de maior risco da sequência — precisa de teste extenso via `[MODULE SELECTOR]`/`[MODULE FILTER]` antes de publicar

## Fora deste roadmap (decisão futura, não planejada ainda)
- Ativação de `FlowAction` como autoridade sobre o Claude (depende de dados reais de `flow_action_decisions`)
- `depends_on` como validação real (hoje é só campo documentado)

## Nota sobre organização
A partir da Sprint 2, a documentação de **conhecimento** (o conteúdo real dos módulos, exemplos, glossário de termos do negócio) deve morar em `/docs/cms/`, separada de `/docs/architecture/` (que documenta a estrutura, não o conteúdo). Essa pasta ainda não existe — será criada quando a Sprint 2 começar.
