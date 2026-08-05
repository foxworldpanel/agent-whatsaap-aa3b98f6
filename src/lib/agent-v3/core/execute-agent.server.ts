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

export type ExecuteAgentInput = OrchestratorInput & {
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

  const agentResult = await runAgentV3Turn(input);

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
