// executeAgent — ponto único de execução do agente. Encapsula o fluxo
// completo: Smart Router primeiro, Claude só se necessário. WhatsApp,
// Playground e qualquer canal futuro devem chamar esta função, nunca
// montar o fluxo por conta própria.
//
// Estado atual: o webhook do WhatsApp já chama esta função (confirmado
// na auditoria do Pacote 5A) — o comentário anterior, que dizia o
// contrário, estava desatualizado.

import { routeMessage, type SmartRouterContext } from "../router/smart-router.server";
import { runAgentV3Turn, type OrchestratorInput, type AgentV3TurnResult } from "../orchestrator.server";
import {
  classifySalesIntelligence,
  type SalesIntelligenceResult,
} from "../sales-intelligence/sales-intelligence-engine.server";
import { logExecutionTrace } from "../telemetry/execution-tracer.server";
import { saveOrderContextV3, deriveOrderContextV3, loadOrderContextV3 } from "../memory/order-context.server";
import { normalizeConversationFactsV3 } from "../memory/conversation-facts.server";

export type ExecuteAgentInput = OrchestratorInput & {
  traceId?: string; // New field
  routerContext: SmartRouterContext;
  // Quando true, pula o Smart Router e vai direto pro Claude — usado
  // pelo WhatsApp pra mensagens que não são texto puro (áudio/imagem) ou
  // que já vêm de um funil adiado, exatamente como o comportamento
  // original antes da unificação.
  skipRouter?: boolean;
};

export type ExecuteAgentResult = {
  route: "code" | "claude";
  routerReason: string;
  reply: string;
  usage: { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
  cost: { input_usd: number; output_usd: number; cache_usd: number; total_usd: number };
  claudeCalled: boolean;
  // Presente só quando route === "claude" — resultado completo do orchestrator.
  agentResult?: AgentV3TurnResult;
  // Sales Intelligence V1 — Fase A. Só classifica, acompanha a execução.
  // NINGUÉM usa este campo pra decidir nada ainda — ver
  // sales-intelligence-engine.server.ts.
  salesIntelligence: SalesIntelligenceResult;
};

const ZERO_COST = { input_usd: 0, output_usd: 0, cache_usd: 0, total_usd: 0 };

// Telemetria de comportamento (Pacote Final) — flag-protegida, mesmo
// padrão já usado em CONTEXT_AUDIT_ENABLED/CONTRACT_REPORTING_ENABLED.
const BEHAVIOR_TELEMETRY_ENABLED =
  (typeof process !== "undefined" && process.env.NODE_ENV !== "production") ||
  (typeof process !== "undefined" && process.env.BEHAVIOR_TELEMETRY_ENABLED === "true");

export async function executeAgent(input: ExecuteAgentInput): Promise<ExecuteAgentResult> {
  // Sales Intelligence V1 — Fase A: classificação pura, calculada uma
  // vez, independente da rota escolhida pelo Router. Não influencia
  // NADA do que acontece depois — só acompanha o resultado final.
  const salesIntelligence = classifySalesIntelligence(input.message);

  // Visibilidade no Execution Trace — Sprint 0 (Sales Agent Activation,
  // 17/08/2026). Mostra exatamente quais sinais e engines participaram
  // da decisão, sem precisar investigar log depois. Requisito direto do
  // ADR-002 (rastreamento desde o primeiro commit).
  if (input.traceId) {
    await logExecutionTrace({
      traceId: input.traceId,
      step: "sales_intelligence",
      conversationId: input.conversationId,
      phone: input.phone,
      details: {
        salesSignals: salesIntelligence.salesSignals,
        objections: salesIntelligence.objections,
        offerEligibility: salesIntelligence.offerEligibility,
        // CUSTOMER_HESITATED continua não conectado a comportamento
        // (redundante com HESITACAO_TOM_TEXT). CUSTOMER_LOST_CONTEXT foi
        // conectado em 21/08/2026 — ver RECUPERACAO_CONTEXTO_TEXT.
        recoveryStatus: salesIntelligence.recoveryStatus,
      },
    });
  }

  const routerResult = input.skipRouter
    ? {
        handled: false,
        reason: "ROUTER_PULADO_TIPO_NAO_TEXTO_OU_FUNIL",
        route: "claude" as const,
        context: { routeReason: "ROUTER_PULADO_TIPO_NAO_TEXTO_OU_FUNIL" },
      }
    : routeMessage(input.message, input.routerContext);

  // Log de diagnóstico — Pacote 5A (Behavior Engineering). Reaproveita
  // BEHAVIOR_TELEMETRY_ENABLED em vez de criar uma flag nova — evita
  // proliferação de flags (mesmo backlog já registrado no Pacote 5A).
  if (BEHAVIOR_TELEMETRY_ENABLED) {
    console.log("[SMART ROUTER]", {
      route: routerResult.route,
      reason: routerResult.reason,
      claude: routerResult.route === "claude",
    });
    console.log("[SALES-INTELLIGENCE]", {
      salesSignals: salesIntelligence.salesSignals,
      objections: salesIntelligence.objections,
      offerEligibility: salesIntelligence.offerEligibility,
      recoveryStatus: salesIntelligence.recoveryStatus,
    });
  }

  if (routerResult.handled && routerResult.response) {
    if (BEHAVIOR_TELEMETRY_ENABLED) {
      console.log("[BEHAVIOR-TELEMETRY]", {
        route: "code",
        context: routerResult.context,
        modulosCarregados: [],
        quantidadeModulos: 0,
        charsEnviadosPromptBuilder: 0,
      });
    }
    return {
      route: "code",
      routerReason: routerResult.reason,
      reply: routerResult.response,
      usage: { input_tokens: 0, output_tokens: 0 },
      cost: ZERO_COST,
      claudeCalled: false,
      salesIntelligence,
    };
  }

  if (input.traceId) {
    await logExecutionTrace({
      traceId: input.traceId,
      step: "conversation_engine_start",
      conversationId: input.conversationId,
      phone: input.phone
    });
  }

  const engineStartAt = Date.now();
  const agentResult = await runAgentV3Turn({
    ...input,
    offerEligibility: salesIntelligence.offerEligibility,
    objections: salesIntelligence.objections,
    recoveryStatus: salesIntelligence.recoveryStatus,
  });
  const engineDuration = Date.now() - engineStartAt;

  if (input.traceId) {
    await logExecutionTrace({
      traceId: input.traceId,
      step: "conversation_engine_end",
      durationMs: engineDuration,
      conversationId: input.conversationId,
      phone: input.phone,
      details: {
        intent: agentResult.intelligence?.intent,
        stage: agentResult.intelligence?.stage
      }
    });
  }

  if (BEHAVIOR_TELEMETRY_ENABLED) {
    const modulosCarregados = agentResult.modules?.selected_keys ?? [];
    const charsEnviadosPromptBuilder = Object.values(agentResult.modules?.estimated_chars_by_module ?? {}).reduce(
      (sum, chars) => sum + chars,
      0,
    );
    console.log("[BEHAVIOR-TELEMETRY]", {
      route: "claude",
      context: {
        ...routerResult.context,
        intentDetectado: agentResult.intelligence?.intent,
        estagioDetectado: agentResult.intelligence?.stage,
      },
      modulosCarregados,
      quantidadeModulos: modulosCarregados.length,
      charsEnviadosPromptBuilder,
    });
  }

  // Conversation Facts Engine — Extração e persistência pós-execução (Fase 2)
  // Garante que o estado do pedido seja atualizado com a resposta final do agente (ex: link enviado, ou pergunta de quantidade)
  if (input.phone && input.workspaceId && input.userId) {
    (async () => {
      try {
        const historyWithReply = [
          ...input.history,
          { role: "agent" as const, content: agentResult.replies.join("\n") }
        ];
        const storedCtx = await loadOrderContextV3(input.phone!, input.workspaceId!);
        const currentFacts = normalizeConversationFactsV3(storedCtx);
        const updatedCtx = deriveOrderContextV3(
          agentResult.replies.join("\n"), 
          historyWithReply, 
          storedCtx, 
          currentFacts
        );
        if (updatedCtx.needsUpdate) {
          await saveOrderContextV3(input.phone!, input.workspaceId!, input.userId!, updatedCtx);
          console.log("[FACTS-ENGINE] Contexto atualizado pós-execução.");
        }
      } catch (e) {
        console.warn("[FACTS-ENGINE] Erro na extração pós-execução:", e);
      }
    })();
  }

  return {
    route: "claude",
    routerReason: routerResult.reason,
    reply: agentResult.replies.join("\n"),
    usage: agentResult.usage as any,
    cost: agentResult.cost,
    claudeCalled: true,
    agentResult,
    salesIntelligence,
  };
}
