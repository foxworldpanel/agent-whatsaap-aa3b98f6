// executeAgent — ponto único de execução do agente. Encapsula o fluxo
// completo: Smart Router primeiro, Claude só se necessário. WhatsApp,
// Playground e qualquer canal futuro devem chamar esta função, nunca
// montar o fluxo por conta própria.
//
// IMPORTANTE (estado desta entrega): o WEBHOOK do WhatsApp ainda NÃO foi
// migrado pra chamar esta função — ele continua com sua lógica inline
// própria (que já faz a mesma coisa, só que não-compartilhada). Migrar
// o webhook pra usar executeAgent() é o próximo passo natural, feito
// separadamente e com cautela, depois de validar esta função no
// Playground primeiro. Isso evita repetir o mesmo risco de sempre:
// tocar no fluxo crítico sem validação prévia.

import { routeMessage, type SmartRouterContext } from "../router/smart-router.server";
import { runAgentV3Turn, type OrchestratorInput, type AgentV3TurnResult } from "../orchestrator.server";

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
};

const ZERO_COST = { input_usd: 0, output_usd: 0, cache_usd: 0, total_usd: 0 };

export async function executeAgent(input: ExecuteAgentInput): Promise<ExecuteAgentResult> {
  const routerResult = input.skipRouter
    ? { handled: false, reason: "ROUTER_PULADO_TIPO_NAO_TEXTO_OU_FUNIL", route: "claude" as const }
    : routeMessage(input.message, input.routerContext);

  if (routerResult.handled && routerResult.response) {
    return {
      route: "code",
      routerReason: routerResult.reason,
      reply: routerResult.response,
      usage: { input_tokens: 0, output_tokens: 0 },
      cost: ZERO_COST,
      claudeCalled: false,
    };
  }

  const agentResult = await runAgentV3Turn(input);

  return {
    route: "claude",
    routerReason: routerResult.reason,
    reply: agentResult.replies.join("\n"),
    usage: agentResult.usage as any,
    cost: agentResult.cost,
    claudeCalled: true,
    agentResult,
  };
}
