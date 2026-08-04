# Contratos de Runtime — CMS V3

## Objetivo
Transformar a arquitetura documentada (`01` a `08`) em tipos TypeScript e validadores reais, prontos pra uso futuro. Esta camada **ainda não é usada pelo runtime** — é preparação, não integração.

## Localização
`src/lib/agent-v3/contracts/module-contract.ts`

Escolhida por seguir o padrão já existente no projeto: tipos ficam co-localizados dentro de `src/lib/agent-v3/<subpasta>/`, junto do domínio que representam (mesmo padrão de `flow/`, `router/`, `selector/`). O projeto não tem uma pasta central de tipos (`src/types`, `src/domain`) — não foi criada uma agora pra não introduzir uma convenção nova e divergente.

## Tipos criados

| Tipo | Valores | Fonte |
|---|---|---|
| `Domain` | `CORE | GLOBAL | SALES | PLATFORMS | ADMIN` | `01-cms-architecture.md` |
| `Platform` | `spotify | youtube | instagram | facebook | tiktok | kwai | x | null` | `06-module-classification.md` (lista real de plataformas confirmadas) |
| `KnowledgeType` | `base, education, catalog, pricing, promotion, delivery, links, support, policy, flow, exception` | `04-governance.md` |
| `ModuleStatus` | `active | legacy | migrate | review` | Convenção da Sprint 2A.2 |

## Interface `ModuleContract`
Reflete o contrato completo definido em `03-module-contract.md`. Os campos `domain`, `platform`, `knowledgeType`, `status` são **novos** (não existem hoje na tabela `agent_modules_v3`). Os campos dentro de `routing` (`intents`, `stages`, `platforms`, `products`, `triggers`, `alwaysLoad`, `dependencies`, `conflicts`) **já existem** no schema real e no código (confirmado na Sprint 2B) — estão aqui só como referência de tipo, não como algo novo sendo criado.

## Validadores
Funções `isValidDomain`, `isValidPlatform`, `isValidKnowledgeType`, `isValidModuleStatus` — checagens simples de pertencimento à lista oficial. `validateModuleContract()` roda as quatro e retorna uma lista de erros (não lança exceção).

**Exemplo do problema que isso resolve** (citado como motivação da sprint):
```typescript
validateModuleContract({ domain: "spotify", knowledgeType: "abc", platform: "spotify", status: "active" })
// → { valid: false, errors: ["domain inválido: \"spotify\"...", "knowledgeType inválido: \"abc\"..."] }
```
Hoje, nada no projeto chama essa validação — é só a ferramenta pronta pra quando alguém decidir usá-la.

## Responsabilidades desta camada
- Definir os tipos oficiais em TypeScript, sincronizados com a documentação
- Validar um objeto candidato contra esses tipos
- **Não** carregar módulos do banco
- **Não** decidir seleção
- **Não** alterar nenhum fluxo existente

## Como será usada no futuro (não implementado agora)
- Sprint 3.2 (proposta): validar módulos no momento de salvar no admin (`admin.functions.ts`), impedindo `domain`/`knowledge_type` inválido de entrar no banco
- Sprint 3.2 (proposta): tipar o retorno de `selectModulesV3()` usando `ModuleContract` em vez de tipos soltos
- Não decidido ainda: se os campos novos (`domain`, `knowledgeType`, `status`) vão virar colunas reais na tabela, ou se continuam só documentais por mais tempo

## Status desta sprint
Camada de tipos e validação criada e testada isoladamente. **Zero integração com runtime, banco ou seleção de módulos.** Nenhum comportamento do agente muda com esta entrega.

Esta camada ainda não é utilizada pelo runtime e não garante validação automática dos módulos existentes. Sua integração será feita gradualmente nas próximas sprints.
