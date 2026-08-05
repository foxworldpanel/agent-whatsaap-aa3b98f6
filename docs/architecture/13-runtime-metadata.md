# Metadados Arquiteturais no Runtime — Sprint 3.4

## Objetivo
Fazer os 4 metadados arquiteturais (`domain`, `platform`, `knowledgeType`, `status`) chegarem ao objeto `LoadedModuleV3`, encerrando a lacuna encontrada na auditoria anterior: a query já trazia esses campos do banco (`select("*")`), mas o mapper os descartava antes de montar o objeto usado pelo resto do sistema.

## O que mudou
**Arquivo:** `src/lib/agent-v3/brain/modules.server.ts`

1. **Interface `LoadedModuleV3`** ganhou 4 campos opcionais:
```typescript
domain?: string;
platform?: string;
knowledgeType?: string;
status?: string;
```

2. **Mapper** passou a ler `row.domain`, `row.platform`, `row.knowledge_type`, `row.status` — cada um vira `undefined` se vazio/nulo, string tratada (trim) se presente.

3. **Log de validação**, só fora de produção (`NODE_ENV !== "production"`), mostra `key`/`domain`/`platform`/`knowledgeType`/`status` de qualquer módulo que tenha `domain` preenchido.

## O que NÃO mudou
- Module Selector, Prompt Builder, Router — nenhum foi tocado
- Nenhuma decisão de carregamento passou a considerar esses campos
- Nenhum módulo muda de comportamento

## Status atual
Os metadados **existem no runtime agora**, mas são **ignorados por completo** pelo resto do sistema — nenhum código além do log de diagnóstico lê `module.domain`/`module.platform`/`module.knowledgeType`/`module.status`. Isso é intencional: esta sprint só prepara o dado, não o usa.

## Validação esperada
Com os 4 módulos já classificados como `GLOBAL` no banco (Sprint 3.3A), o log deve mostrar algo como:

[v3-modules] [METADATA] { key: 'pagamento', domain: 'GLOBAL', platform: undefined, knowledgeType: undefined, status: undefined }
[v3-modules] [METADATA] { key: 'como_comprar_no_painel', domain: 'GLOBAL', ... }
[v3-modules] [METADATA] { key: 'suporte', domain: 'GLOBAL', ... }
[v3-modules] [METADATA] { key: 'seguranca_pix', domain: 'GLOBAL', ... }

Os outros 25 módulos (sem `domain` preenchido no banco ainda) não geram log — reduz ruído, já que hoje é a maioria.

## Próximos passos (não implementados nesta sprint)
- Usar `module.domain === "GLOBAL"` em alguma decisão real do Module Selector ou do Prompt Builder
- Completar a classificação dos 25 módulos restantes no banco
- Remover ou manter o log de diagnóstico permanentemente (decisão futura)
