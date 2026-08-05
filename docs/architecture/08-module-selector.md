# Auditoria Técnica — Module Selector V3

## Metodologia
Todo o conteúdo deste documento vem de leitura direta do código real (`module-selector.server.ts`, `orchestrator.server.ts`), clonado fresco do repositório no momento da auditoria. Nenhuma seção foi escrita por suposição. Onde não havia certeza absoluta, isso está marcado explicitamente na seção "Hipóteses".

## 1. Arquivos envolvidos na seleção

| Arquivo | Papel |
|---|---|
| `src/lib/agent-v3/selector/module-selector.server.ts` | Contém `detectConversationContext()` e `selectModulesV3()` — o núcleo da seleção |
| `src/lib/agent-v3/orchestrator.server.ts` | Chama `selectModulesV3()` e usa o resultado pra montar o prompt final |
| `src/lib/agent-v3/admin/admin.functions.ts` | Carrega os módulos do banco (`agent_modules_v3`) pro formato usado pelo selector |
| `src/lib/agent-v3/memory/order-context.server.ts` | Reaproveita `detectConversationContext()` — não participa da seleção de módulos em si, só do `OrderContext` (camada de observação separada) |

## 2. Ordem real de execução (extraída do código, não assumida)

Mensagem + Histórico
↓
detectConversationContext()
→ produz: intent, stage, platform, product
↓
selectModulesV3()
↓
Para cada módulo, ordenado por priority (maior primeiro):

CORE / always_load (sempre entra, "required")

selector_intents (bate com intent detectado)

selector_stages (bate com stage detectado)

selector_platforms (só se o módulo NÃO tiver
intent/stage/product/trigger definidos — ver nota "roteamento fino")

Módulo legado (key === platform) → entra como "required"

selector_products (bate com product detectado)

selector_triggers (bate com palavra-chave na mensagem atual)
↓
Bloco especial: Instagram + seguidores (ver seção 8)
↓
Resolução de autoridade comercial (Spotify: submódulo específico
remove módulos genéricos concorrentes)
↓
Resolução de dependências (routing.dependencies, transitiva)
↓
Resolução de conflitos (routing.conflicts, prioridade decide)
↓
FILTROS NEGATIVOS (platform, product, stage — ver seção 11)
↓
Lista final de módulos selecionados
↓
Prompt Builder monta o texto final


**Nota "roteamento fino" (linha ~555-568 do código):** um módulo só é carregado *apenas* por `selector_platforms` quando ele **não tem** nenhum `intent`, `stage`, `product` or `trigger` configurado (`hasFineGrainedRouting = false`). Se o módulo tiver qualquer um desses campos preenchidos, o match de plataforma sozinho **não é suficiente** — precisa também bater intent/stage/product/trigger. Isso existe pra evitar carregar toda a família `spotify_*` só porque a mensagem menciona "Spotify".

## Fluxograma completo

Mensagem + Histórico
│
▼
Context Detection
(detectConversationContext)
│
┌────┼────┬────────┐
▼ ▼ ▼ ▼
Platform Product Intent Stage
│ │ │ │
└────┴────┴────┬───┘
▼
Loop por módulo (ordenado por priority)
│
┌──────────┼──────────────┬──────────────┬──────────────┐
▼ ▼ ▼ ▼ ▼
CORE/always Intent match Stage match Platform match Legacy key
(required) (só se sem match
roteamento fino) (required)
│ │ │ │
└──────────────┴──────┬───────┴──────────────┘
▼
Product match
│
▼
Trigger match
│
▼
Bloco especial Instagram+seguidores
(varre content, não usa selector)
│
▼
Autoridade comercial (Spotify:
submódulo remove módulo genérico)
│
▼
Dependencies (routing.dependencies,
resolução transitiva)
│
▼
Conflict Resolution (routing.conflicts,
prioridade decide)
│
▼
Module Filters (negativos:
platform/product/stage mismatch → remove)
│
▼
Lista final de módulos selecionados
│
▼
Prompt Builder
│
▼
LLM (Claude)


## 3-7. Como cada campo funciona (evidência linha a linha)

| Campo | Mecanismo real | Compara contra |
|---|---|---|
| `selector_triggers` | `routing.triggers.find(term => containsAny(normalizedText, [term]))` | Só a **mensagem atual** do cliente (não histórico, não mensagens do agente) |
| `selector_intents` | `routing.intents.includes(context.intent)` | O `intent` único detectado pra esse turno |
| `selector_platforms` | `routing.platforms.includes(context.platform)` — mas só conta se `hasFineGrainedRouting = false` (ver nota acima) | O `platform` único detectado |
| `selector_products` | `routing.products.includes(context.product)` | O `product` único detectado |
| `selector_stages` | `routing.stages.includes(context.stage)` | O `stage` único detectado |

## 8. O que acontece com módulos sem nenhum selector (Instagram, Facebook, TikTok, Kwai, X, YouTube)

**Achado principal desta auditoria.** Existe um mecanismo de fallback **não documentado em nenhuma sprint anterior**:

```typescript
// Compatibilidade com módulos legados de chave exata da plataforma.
if (context.platform && key === context.platform) {
  add(key, `Módulo legado correspondente à plataforma ${context.platform}`, { required: true });
}
```

Se a **key do módulo bate exatamente com o valor de `context.platform`** (ex: módulo com key `"instagram"`, e o cliente mencionou Instagram), ele é carregado como **obrigatório**, independente de ter qualquer `selector_*` preenchido. Isso explica como `instagram`, `facebook`, `tiktok`, `kwai`, `youtube` — todos com selectors vazios, confirmados na Sprint 2A.2 — efetivamente carregam na prática, mesmo sem estarem "roteados" no sentido moderno.

**Hipótese não confirmada:** não sei se o módulo `x` (key = `"x"`) é carregado por esse mecanismo, porque não confirmei se a função de detecção de plataforma (`PLATFORM_PATTERNS`) reconhece `"x"` como valor de `context.platform`, ou se ainda espera `"twitter"`. Isso precisa de teste real (log `[MODULE SELECTOR]`) pra confirmar.

## 9. Como entram os módulos CORE

```typescript
if (routing.alwaysLoad || key === "identidade" || key === "regras_gerais") {
  add(key, ..., { required: true });
}
```

Existem **duas** formas: `always_load: true` no banco (nenhum módulo tem isso hoje, confirmado na Sprint 2A.2), **ou** a key ser literalmente `"identidade"` ou `"regras_gerais"` — hardcoded no código, funciona independente do banco. Isso confirma o que já havia sido levantado antes: o "sempre carrega" de Identidade/Regras Gerais vem do **código**, não de configuração.

## 10. Como entram os módulos GLOBAL

O runtime não possui conhecimento do conceito arquitetural `GLOBAL`. O domínio `GLOBAL` existe apenas como organização documental do CMS (Sprint 1). Todos os módulos continuam sendo tratados igualmente pelo Module Selector — `seguranca_pix`, `pagamento`, `como_comprar_no_painel` entram pelos mesmos mecanismos genéricos (intent/stage/trigger) que qualquer outro módulo, sem tratamento diferenciado por domínio no código.

## 11. Filtro negativo — onde acontece

Confirmado, implementado nas correções desta mesma investigação (antes desta sprint de documentação):

```typescript
// Roda DEPOIS de toda a seleção positiva, ANTES da resolução final
for (const key of Array.from(selected)) {
  for (const filter of negativeFilters) { // platform, product, stage
    if (!filter.scoped(routing)) continue;
    if (filter.matches(routing)) continue;
    selected.delete(key); // remove
  }
}
```

Remove um módulo já selecionado se ele declara `selector_platforms`/`selector_products`/`selector_stages` e o valor atual da conversa não bate — **mesmo que o módulo tenha entrado por outro caminho** (ex: intent). Só afeta módulos que **têm** o campo preenchido — não afeta os módulos "legados" da seção 8, que não têm nenhum selector.

## 12. Fallbacks existentes, em ordem

1. **CORE hardcoded** (seção 9) — `identidade`/`regras_gerais` sempre entram
2. **Módulo legado por key === platform** (seção 8) — entra como obrigatório
3. **Autoridade comercial Spotify** — se `spotify_precos` ou `spotify_royalties` foram selecionados, remove o módulo genérico `spotify` do conjunto (evita 2 fontes de preço competindo)
4. **Bloco especial Instagram+seguidores** — varre `module.content` diretamente (não usa selector nenhum) procurando módulos que mencionem "seguidor" + tenham linguagem comercial (`R$`, "preço", "promocional"), e os inclui todos de uma vez, removendo `instagram` e `tabela_precos` genéricos

## 13. Prioridade — como é usada

`priority` (number) ordena em qual sequência os módulos são **avaliados** (maior primeiro) — não define quantos entram, só a ordem do loop. Existe um limite: `MAX_PRIMARY_MODULES = 11` — módulos não-`required` param de ser adicionados depois que 11 já foram selecionados (`if (!options?.required && selected.size >= MAX_PRIMARY_MODULES) return;`). Módulos marcados `required: true` (CORE, legado, dependência, Instagram especial) **ignoram esse limite**.

## 14. O banco influencia a seleção, ou é tudo runtime?

**Os dois.** O banco fornece os valores (`selector_triggers`, `selector_intents`, etc. — dados). A **lógica** de como esses valores são comparados, em que ordem, com quais exceções (roteamento fino, autoridade comercial, bloco Instagram) está **inteiramente no código**, não é configurável pelo CMS.

## 15. Comportamentos inesperados encontrados nesta auditoria

1. **Módulos sem nenhum selector carregam via match de key com plataforma** (seção 8) — não documentado antes, muda a interpretação da Sprint 2A.2 (esses módulos "Baixa confiança" na verdade têm um mecanismo real e específico, só que fora do sistema `selector_*` moderno).
2. **`routing.dependencies` e `routing.conflicts` já existem no código** — a Sprint 1 documentou `depends_on` como "campo proposto, não implementado", mas na verdade já existe implementado sob outro nome. **Correção de documentação necessária.**
3. **Bloco especial hardcoded só para Instagram+seguidores** — nenhuma outra plataforma tem tratamento equivalente no código; se Spotify ou YouTube precisarem do mesmo tipo de comparação multi-módulo no futuro, hoje exigiria duplicar essa lógica específica, não é genérico.
4. **`x` (Twitter) — comportamento não confirmado por teste real** (ver seção 8).

## Pontos fortes
- Filtros negativos são puramente determinísticos, fáceis de auditar
- Separação clara entre "candidatos" (loop principal) e "remoção" (filtros negativos, resolução de conflitos) — duas fases bem definidas
- Sistema de dependências/conflitos já existente é mais maduro do que a documentação anterior sugeria

## Pontos de atenção
- O fallback de "key === platform" é uma regra implícita, não documentada em lugar nenhum do CMS/admin — alguém criando um módulo novo não saberia que nomear a key exatamente como uma plataforma tem esse efeito especial
- O bloco especial de Instagram é uma exceção hardcoded que não escala pra outras plataformas sem duplicar código
- `hasFineGrainedRouting` é uma regra sutil que pode surpreender quem configura `selector_platforms` sem entender que precisa de mais um campo pra realmente funcionar como pretendido
