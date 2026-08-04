# Contrato Oficial de Módulo

## Objetivo
Define os campos que todo módulo do CMS deve ter, pra deixar explícito de que domínio/plataforma/tipo ele é, sem precisar inferir isso pelo nome ou pelo conteúdo.

## Campos do contrato

```yaml
id: string                    # chave única, igual ao "key" de hoje (ex: spotify_garantia)
domain: CORE | GLOBAL | SALES | PLATFORMS | ADMIN
platform: string | null       # ex: "spotify" — null se domain != PLATFORMS
knowledge_type: base | education | catalog | pricing | promotion | delivery | support | policy | exception | flow
priority: number              # igual ao campo "priority" que já existe hoje
selector_intents: string[]    # igual ao campo já existente
selector_triggers: string[]   # igual ao campo já existente
depends_on: string[]          # ids de outros módulos que este pressupõe (novo — ver nota)
```

## Nota sobre `depends_on`
Esse campo não existe hoje no banco. Representa uma dependência editorial (ex: um módulo de `pricing` pode `depends_on: [platform.base]`, indicando que só faz sentido junto com o módulo base daquela plataforma). É um campo **documentado, não implementado** — pode virar realidade se o Module Selector evoluir pra validar dependências entre módulos.

## Relação com os campos que já existem hoje

| Campo do contrato | Já existe no banco hoje? |
|---|---|
| `id` | ✅ Sim (`key`) |
| `domain` | ❌ Não — proposto nesta sprint |
| `platform` | ✅ Sim (`selector_platforms`, como array) |
| `knowledge_type` | ❌ Não — proposto nesta sprint |
| `priority` | ✅ Sim |
| `selector_intents` | ✅ Sim |
| `selector_triggers` | ✅ Sim |
| `depends_on` | ❌ Não — proposto nesta sprint |

## Status desta versão
Contrato documentado. Nenhum campo novo foi criado no banco, nenhuma migration foi rodada. Isso é trabalho de uma sprint futura.
