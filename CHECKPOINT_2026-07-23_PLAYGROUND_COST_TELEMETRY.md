# Checkpoint — Playground Cost & Prompt Telemetry

Data: 2026-07-23
Base: agent-whatsaap-aa3b98f6-main(33).zip

## Correções

### 1. Impacto no Prompt não mostra mais 0/0 por campo inexistente
O frontend procurava `modules.with_commercial`, campo que o orchestrator nunca retornava.

O orchestrator agora expõe explicitamente:
- `prompt_tokens_without_commercial`
- `prompt_tokens_with_commercial`
- `commercial_tokens_added`
- `estimated_chars_by_module`

A tela usa esses campos e mantém fallback compatível com execuções antigas.

### 2. Telemetria por módulo mostra chars reais
Antes a interface reconstruía `chars` como `tokens * 4`. Agora usa o tamanho real do conteúdo do módulo quando disponível.

### 3. Separação entre estimativa do prompt e usage faturável
A seção "Impacto no Prompt" agora informa explicitamente que os tokens por módulo são uma estimativa baseada em tamanho de texto, não os tokens faturáveis retornados pela Anthropic.

### 4. Custo acumulado da conversa/sessão
A aba Custo agora mostra:
- custo da execução atual;
- custo acumulado de todas as chamadas salvas na sessão;
- quantidade de chamadas;
- input tokens acumulados;
- output tokens acumulados;
- cache write acumulado;
- cache read acumulado.

Isso permite comparar uma conversa de várias respostas com o total agregado exibido pela Anthropic, em vez de comparar o custo de uma única chamada com toda a conversa.

## Arquivos alterados
- `src/lib/agent-v3/orchestrator.server.ts`
- `src/routes/_authenticated.admin.agent-playground.tsx`
- `CHECKPOINT_2026-07-23_PLAYGROUND_COST_TELEMETRY.md`

## Observação de preço
O runtime continua em `claude-haiku-4-5`. O cálculo existente usa US$ 1/MTok input, US$ 5/MTok output, cache write de 5 min a US$ 1,25/MTok e cache read a US$ 0,10/MTok.
