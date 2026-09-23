import { isHumanHandoffRequest, isStopRequest } from "../runtime-support.server";
import { shouldStaySilentForNaturalConversation } from "../brain/guards.server";

export type SharedPreExecutionDecision =
  | { kind: "continue" }
  | { kind: "stop_request"; reply: null }
  | { kind: "human_handoff"; reply: string }
  | { kind: "natural_silence"; reply: null };

const HUMAN_HANDOFF_REPLY =
  "Claro. Vou pausar por aqui e encaminhar seu atendimento para o setor responsável. Assim que possível, a equipe dará continuidade por aqui.";

export function decideSharedPreExecution(params: {
  message: string;
  inputKind?: string;
  history: Array<{ role: "agent" | "customer"; content: string }>;
}): SharedPreExecutionDecision {
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
