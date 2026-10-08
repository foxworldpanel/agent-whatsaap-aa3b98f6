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
    expect(source).toContain("if (funnelAlreadyCompleted && !convState.resumedWithGreeting)");
    expect(source).toContain("PROIBIDO iniciar esta resposta");
  });
  it("allows a greeting when the customer reopens on a new calendar day", () => {
    const yesterday = new Date(Date.now() - 12 * 60 * 60 * 1000);
    yesterday.setDate(new Date().getDate() - 1);
    const state = detectConversationState({
      message: "Bom dia! Tenho uma dúvida",
      history: [{ role: "agent", content: "Qualquer dúvida é só chamar.", timestamp: yesterday.toISOString() }],
      greetingAlreadyPerformed: true,
    });
    expect(state.resumedWithGreeting).toBe(true);
    expect(state.greetingAlreadyDone).toBe(false);
  });

  it("preserves post-sale when a purchased-service safety question arrives", () => {
    const previous = deriveBusinessDecisionV3({ message: "Feito, já comprei", recentCustomerMessages: [] });
    const current = deriveBusinessDecisionV3({
      message: "Esse impulsionamento do Spotify pode me prejudicar?",
      recentCustomerMessages: [],
    });
    const result = reconcileBusinessDecisionV3({ previous, current, message: "Esse impulsionamento do Spotify pode me prejudicar?" });
    expect(result.state).toBe("pos_venda");
    expect(result.allowQualification).toBe(false);
    expect(result.reason).toContain("pós-venda");
  });

  it("locks conservative Spotify safety guidance in the shared orchestrator", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/agent-v3/orchestrator.server.ts"), "utf8");
    expect(source).not.toContain("entre 500 e 650 plays por dia");
    expect(source).toContain("Não é correto garantir risco zero");
    expect(source).toContain("ausência de penalização ou resultado do algoritmo");
  });
});


describe("Agent V3 — autoridade operacional de pagamento", () => {
  it("obriga o runtime a carregar do CMS a fonte de depósito/Pix/cripto", async () => {
    const source = readFileSync(join(process.cwd(), "src/lib/agent-v3/orchestrator.server.ts"), "utf8");
    expect(source).toContain('selectionContext.intent === "pagamento" || selectionContext.hasPaymentSignal');
    expect(source).toContain("documentsDepositFlow");
    expect(source).toContain("Autoridade operacional do CMS para depósito/saldo e meios de pagamento");
  });

  it("proíbe inventar menu de saldo e não oferece mínimo sem o cliente pedir", async () => {
    const source = readFileSync(join(process.cwd(), "src/lib/agent-v3/prompt/prompt-p1.server.ts"), "utf8");
    expect(source).toContain('Não invente nomes de menus como "Recarga" ou "Adicionar Saldo"');
    expect(source).toContain("Informe o mínimo somente se ele perguntar");
  });
});


describe("real conversation 244989649010936 — explicit order-status support", () => {
  it("classifies 'saber se caiu pq pedi' as post-sale even before durable lifecycle conversion", async () => {
    const { deriveBusinessDecisionV3 } = await import("../src/lib/agent-v3/brain/business-state.server");
    const d = deriveBusinessDecisionV3({
      message: "Bom dia como\nSaber se caiu pq pedi",
      recentCustomerMessages: ["Olá! Tenho interesse em divulgar minha música."],
      customerLifecycle: "novo_lead",
    });
    expect(d.state).toBe("pos_venda");
    expect(d.allowQualification).toBe(false);
    expect(d.nextAction).not.toMatch(/preço pago|quanto pagou/i);
  });

  it("preserves post-sale across the customer's Spotify/service details", async () => {
    const { deriveBusinessDecisionV3, enrichBusinessDecisionV3, reconcileBusinessDecisionV3 } = await import("../src/lib/agent-v3/brain/business-state.server");
    const previous = enrichBusinessDecisionV3(deriveBusinessDecisionV3({
      message: "Bom dia como saber se caiu pq pedi",
      customerLifecycle: "novo_lead",
    }), "Bom dia como saber se caiu pq pedi");
    const current = enrichBusinessDecisionV3(deriveBusinessDecisionV3({
      message: "500 play 200 seguidores",
      recentCustomerMessages: ["Bom dia como saber se caiu pq pedi", "Spoitofy"],
      customerLifecycle: "novo_lead",
    }), "500 play 200 seguidores");
    const reconciled = reconcileBusinessDecisionV3({ previous, current, message: "500 play 200 seguidores" });
    expect(reconciled.state).toBe("pos_venda");
    expect(reconciled.allowQualification).toBe(false);
  });
});


describe("business-state semantic boundary — completed order vs support incident", () => {
  it("keeps a plain completed-order confirmation as pedido_realizado", async () => {
    const { deriveBusinessDecisionV3 } = await import("../src/lib/agent-v3/brain/business-state.server");
    expect(deriveBusinessDecisionV3({ message: "pedido confirmado", customerLifecycle: "novo_lead" }).state).toBe("pedido_realizado");
    expect(deriveBusinessDecisionV3({ message: "já paguei", customerLifecycle: "novo_lead" }).state).toBe("pedido_realizado");
  });

  it("treats an order-status problem as pos_venda without requiring cliente lifecycle", async () => {
    const { deriveBusinessDecisionV3 } = await import("../src/lib/agent-v3/brain/business-state.server");
    const d = deriveBusinessDecisionV3({ message: "Bom dia como saber se caiu pq pedi", customerLifecycle: "novo_lead" });
    expect(d.state).toBe("pos_venda");
    expect(d.allowQualification).toBe(false);
    expect(d.nextAction).not.toMatch(/quanto pagou|preço pago/i);
  });
});


describe("conversa real 244989649010936 — print de pedido no pós-venda", () => {
  it("classifica print enriquecido de pedido como pos_venda sem handoff", async () => {
    const { deriveBusinessDecisionV3 } = await import("../src/lib/agent-v3/brain/business-state.server");
    const d = deriveBusinessDecisionV3({
      message: `[imagem recebida]
[Imagem: Histórico de Pedido
ID: 1123513
Data: 29/09/2026
Hora: 00:59:34
Status: In progress
912 - Spotify - Plays + Ouvintes [BRASIL] [LENTO: 50 - 100 POR DIA]
Quantidade: 500
Valor: R$ 7,50
Contagem Inicial: 1
Restante: 492]`,
      customerLifecycle: "novo_lead",
      recentCustomerMessages: ["Bom dia como saber se caiu pq pedi", "Spoitofy", "500 play 200 seguidores"],
    });
    expect(d.state).toBe("pos_venda");
    expect(d.shouldHandoff).toBe(false);
    expect(d.allowQualification).toBe(false);
    expect(d.nextAction).toMatch(/campos visíveis|regras operacionais/i);
  });

  it("mantém no prompt que print legível normal não vai para revisão automática", () => {
    const postSale = readFileSync(join(process.cwd(), "src/lib/agent-v3/prompt/prompt-post-sale.server.ts"), "utf8");
    const vision = readFileSync(join(process.cwd(), "src/lib/agent-v3/prompt/prompt-p2.server.ts"), "utf8");
    expect(postSale).toContain("NÃO é motivo para handoff");
    expect(postSale).toContain("até 24h");
    expect(postSale).toContain("até 72h");
    expect(vision).toContain("print do histórico de pedido");
    expect(vision).toContain("não encaminhe para revisão só por ser pós-venda");
  });
});
