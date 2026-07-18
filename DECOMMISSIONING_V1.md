# Descomissionamento Definitivo: Arquitetura V1

Este documento registra o processo de remoção da arquitetura V1 e a transição exclusiva para a **Runtime V2** no projeto Agente Mind.

## 📅 Status Atual: Fase 2 (Inventário) e Fase 3 (Migração)
**Data:** 17 de Julho de 2026
**Responsável:** Lovable Agent

---

## 📋 Inventário de Dependências (Fase 2)

### A. Exclusivo da V1 (Removível após isolamento)
- `src/lib/ai.server.ts`: Motor de inferência legado (Claude V1).
- `src/lib/agent-modules.ts`: Definições de módulos estáticos V1.
- `src/lib/agent-identity.server.ts`: Templates de identidade e regras de prompt V1.
- `src/lib/send-agent-guarded.server.ts`: Wrapper de envio legado (utiliza `humanizePunctuation` da V1).
- `src/lib/kb-relevance.ts`: Sistema de busca de FAQ legado (compartilhado mas focado na V1).

### B. Compartilhado (Necessário migrar para Camada Neutra)
- `getLatestClientMessage`: Lógica de extração da última mensagem.
- `isSupportOrPostSaleContext`: Detecção de contexto de suporte.
- `pickReengagementGreeting`: Lógica de saudação dinâmica.
- `transcribeAudioUrl`: Transcrição via Whisper.
- `ttsElevenLabsBase64`: TTS ElevenLabs.
- `describePanelScreen`: Visão (Claude Sonnet) para telas do painel.
- `classifyLeadTemperature`: Classificação de leads.

### C. Estruturas de Banco de Dados (Marcar como Deprecated)
- Tabela `agent_config`: Campos `base_instruction`, `modules`, `modules_enabled`, `faqs`, `script_frio/inativo/ativo`.
- Tabela `agent_identity`: Toda a estrutura de identidade V1.
- Tabela `agent_logs`: Metadados específicos da V1.

---

## 🛠️ Ações Executadas (Ponto de Restauração)

1. **Roteamento Protegido:** Webhook `uazapi-webhook.ts` configurado para forçar V2 no workspace Mind.
2. **Segurança de Runtime:** Bloqueio `V1_EXECUTION_BLOCKED` inserido em `generateAgentReplyWithMeta` para o workspace Mind.
3. **Limite de Custo:** Desativada regeneração automática e promoção Sonnet na V2.
4. **Resolução de Conflitos:** `src/routes/index.tsx` criado como Dashboard de Descomissionamento; Painel legado movido para `/dashboard`.

---

## 🚀 Próximos Passos
1. Criar `src/lib/agent-v2/core/ai-services.server.ts`.
2. Criar `src/lib/agent-v2/core/conversation-utils.server.ts`.
3. Redirecionar imports do Webhook e `send-agent-guarded.server.ts`.
4. Remover `ai.server.ts` e arquivos dependentes da árvore de build da V2.
