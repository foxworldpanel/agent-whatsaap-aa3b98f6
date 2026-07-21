# Agente V3 Stable — consolidação final

Esta versão mantém V1/V2 isoladas e consolida apenas o runtime V3.

## Arquitetura oficial

`Uazapi webhook → runAgentV3Turn → contexto → seletor orientado pelo CMS → Prompt Builder → Anthropic → guards → telemetria`

## Fonte única da verdade

O conteúdo e o roteamento dos módulos vêm de `agent_modules_v3`.
O código V3 contém somente lógica técnica de detecção, seleção, composição e segurança.
Não existe fallback de persona, regras comerciais ou comportamento no código.

## Migration obrigatória

Aplicar:

`supabase/migrations/20260721220000_v3_cms_selector_metadata.sql`

Ela adiciona ao CMS:

- `always_load`
- `selector_intents`
- `selector_stages`
- `selector_platforms`
- `selector_products`
- `selector_triggers`
- `selector_dependencies`
- `selector_conflicts`

Sem essa migration o runtime interrompe o turno de forma explícita, evitando respostas sem identidade ou com conhecimento incompleto.

## Correções principais

- removidos fallbacks de conteúdo no código;
- removidos UUIDs fixos do runtime e das auditorias V3;
- webhook não assume usuário, workspace ou URL de instância;
- seletor usa metadados do CMS para decidir módulos;
- dependências e conflitos passam a ser configuráveis pelo CMS;
- módulos desabilitados nunca reaparecem;
- auditoria usa o workspace ativo da sessão;
- auditoria identifica módulos habilitados sem rota de seleção;
- preview usa o mesmo seletor da produção;
- seed de conhecimento pelo código foi desativado;
- arquivos de teste internos obsoletos foram removidos.

## Validação executada

- `npm run build`: aprovado;
- `npx vitest run tests/v3/module-selector-cms.test.ts`: 10/10 testes aprovados;
- `npm audit --omit=dev`: nenhuma vulnerabilidade de produção encontrada.

## Publicação

1. Fazer backup do repositório e do banco.
2. Subir todos os arquivos desta versão.
3. Aplicar as migrations do Supabase, incluindo a migration V3 Stable.
4. Conferir no CMS se os módulos `identidade`, `regras_gerais` e `comportamento_humano` estão habilitados e com `always_load=true`.
5. Testar o Playground.
6. Testar uma instância real da Uazapi.
7. Publicar.

## Segurança

Foram removidas credenciais literais encontradas em migrations históricas. As chaves que já estiveram no repositório devem ser consideradas expostas e rotacionadas nos respectivos provedores (Anthropic, OpenAI e ElevenLabs).
