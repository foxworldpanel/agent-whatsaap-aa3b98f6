import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { detectConversationState, conversationStateToPrompt } from "../src/lib/agent-v3/core/conversation-engine.server";
import { decideSharedPreExecution } from "../src/lib/agent-v3/core/pre-execution-decision.server";
import { autoSplitLongPartsV3 } from "../src/lib/agent-v3/integrations/audio-processor.server";
import { deriveBusinessDecisionV3, reconcileBusinessDecisionV3 } from "../src/lib/agent-v3/brain/business-state.server";
import { isLowInformationSocialMessageV3, saysPreviouslyUsedMindV3 } from "../src/lib/agent-v3/core/commercial-response-guards.server";

describe("real conversation regressions 2026-09-28", () => {
  it("treats a completed Welcome Funnel as the greeting already performed", () => {
    const state = detectConversationState({
      message: "Porém, quero resultados!",
      history: [],
      greetingAlreadyPerformed: true,
    });
    expect(state.greetingAlreadyDone).toBe(true);
    expect(conversationStateToPrompt(state)).toContain("DO NOT greet the customer again");
  });

  it("answers an explicit site/link request immediately", () => {
    const result = decideSharedPreExecution({
      message: "Oi vcs tem o site pra acessar",
      history: [],
      inputKind: "texto",
    });
    expect(result.kind).toBe("panel_link");
    expect(result.reply).toContain("https://mindsmmpanel.com");
  });

  it("does not split an unfinished sentence into broken WhatsApp fragments", () => {
    const text = "Sim, é https://mindsmmpanel.com lá você cria conta escolhe o serviço e compra direto porque o painel concentra todo o processo sem precisar quebrar esta construção no meio";
    expect(autoSplitLongPartsV3(text, 40)).toEqual([text]);
  });

  it("recognizes a previous Mind customer signal", () => {
    expect(saysPreviouslyUsedMindV3("A sim.eu já usei o sistema")).toBe(true);
    const decision = deriveBusinessDecisionV3({
      message: "A sim.eu já usei o sistema",
      recentCustomerMessages: [],
    });
    expect(decision.reason).toContain("já utilizou o sistema");
  });

  it("treats an isolated emoji as low-information social content", () => {
    expect(isLowInformationSocialMessageV3("🙏")).toBe(true);
    expect(isLowInformationSocialMessageV3("Spotify")).toBe(false);
  });

  it("does not accumulate continuity prefixes", () => {
    const previous = {
      state: "fechamento" as const,
      risk: "normal" as const,
      reason: "continuidade preservada: continuidade preservada: cliente já definiu produto/quantidade ou está fechando",
      nextAction: "calcular/confirmar valor",
      allowQualification: false,
      shouldHandoff: false,
    };
    const current = deriveBusinessDecisionV3({ message: "sim", recentCustomerMessages: [] });
    const result = reconcileBusinessDecisionV3({ previous, current, message: "sim" });
    expect(result.reason).toBe("continuidade preservada: cliente já definiu produto/quantidade ou está fechando");
  });

  it("keeps a hard post-funnel no-greeting guard in the shared orchestrator", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/agent-v3/orchestrator.server.ts"), "utf8");
    expect(source).toContain("WELCOME FUNNEL JÁ CONCLUÍDO");
    expect(source).toContain("if (funnelAlreadyCompleted)");
    expect(source).toContain("PROIBIDO iniciar esta resposta");
  });
});
