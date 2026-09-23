import { evaluateCriticalHumanEscalation, isHumanHandoffRequest, isStopRequest } from "../runtime-support.server";
import { shouldStaySilentForNaturalConversation } from "../brain/guards.server";

export type SharedPreExecutionDecision =
  | { kind: "continue" }
  | { kind: "stop_request"; reply: null }
  | { kind: "human_handoff"; reply: string }
  | { kind: "critical_handoff"; reply: string; reason: string }
  | { kind: "natural_silence"; reply: null };

const HUMAN_HANDOFF_REPLY =
  "Claro. Vou pausar por aqui e encaminhar seu atendimento para o setor responsável. Assim que possível, a equipe dará continuidade por aqui.";

export function decideSharedPreExecution(params: {
  message: string;
  inputKind?: string;
  history: Array<{ role: "agent" | "customer"; content: string }>;
}): SharedPreExecutionDecision {
  const recentCustomerText = params.history
    .filter((item) => item.role === "customer")
    .slice(-20)
    .map((item) => item.content)
    .join(" ");
  const critical = evaluateCriticalHumanEscalation({
    currentText: params.message,
    recentCustomerText,
  });
  if (critical.escalate) {
    return {
      kind: "critical_handoff",
      reply: "Entendi. Como seu caso precisa de uma análise mais detalhada, vou pausar por aqui e encaminhar para o setor responsável. Assim que possível, a equipe dará continuidade ao seu atendimento.",
      reason: critical.reason || "suporte humano necessário",
    };
  }
  if (isHumanHandoffRequest(params.message)) {
    return { kind: "human_handoff", reply: HUMAN_HANDOFF_REPLY };
  }
  if (isStopRequest(params.message)) {
    return { kind: "stop_request", reply: null };
  }
  if (
    params.inputKind === "texto" &&
    shouldStaySilentForNaturalConversation({
      message: params.message,
      history: params.history.map((item) => ({
        sender: item.role === "agent" ? "agente" : "cliente",
        body: item.content,
      })),
    })
  ) {
    return { kind: "natural_silence", reply: null };
  }
  return { kind: "continue" };
}
