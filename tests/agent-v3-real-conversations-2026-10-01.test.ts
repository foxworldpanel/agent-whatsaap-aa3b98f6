import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deriveBusinessDecisionV3, reconcileBusinessDecisionV3 } from "../src/lib/agent-v3/brain/business-state.server";
import { applyBusinessDecisionToIntelligence } from "../src/lib/agent-v3/core/intelligence-utils.server";
import { derivePersistentContactTemperatureV3 } from "../src/lib/agent-v3/memory/contact-temperature.server";
import { deriveOrderContextV3, EMPTY_ORDER_CONTEXT, orderContextSummaryV3 } from "../src/lib/agent-v3/memory/order-context.server";
import { routeMessage } from "../src/lib/agent-v3/router/smart-router.server";
import { detectConversationState } from "../src/lib/agent-v3/core/conversation-engine.server";

describe("real conversations batch 2026-09-29/30", () => {
  it("generic payment vocabulary does not mean operational payment", () => {
    const d = deriveBusinessDecisionV3({ message: "quero saber se o pagamento é mensal, anual ou vitalício" });
    expect(d.state).not.toBe("pagamento");
  });

  it("explicit request to pay is operational payment", () => {
    const d = deriveBusinessDecisionV3({ message: "manda o pix que eu vou pagar" });
    expect(d.state).toBe("pagamento");
  });

  it("defers when money is only expected later", () => {
    const d = deriveBusinessDecisionV3({ message: "quando cair o dinheiro na conta a gente conversa" });
    expect(d.state).toBe("adiado");
  });

  it("defers when customer needs to see what money remains", () => {
    const d = deriveBusinessDecisionV3({ message: "no momento tá difícil, vou ver quanto vai me sobrar" });
    expect(d.state).toBe("adiado");
  });

  it("explicit yes after closing advances to payment without becoming customer", () => {
    const previous = deriveBusinessDecisionV3({
      message: "quero 2000 plays, quanto fica?",
      recentCustomerMessages: ["Spotify", "plays + ouvintes"],
    });
    expect(previous.state).toBe("orcamento");
    const closing = { ...previous, state: "fechamento" as const, reason: "cliente já definiu produto/quantidade ou está fechando" };
    const current = deriveBusinessDecisionV3({ message: "sim" });
    const result = reconcileBusinessDecisionV3({ previous: closing, current, message: "sim" });
    expect(result.state).toBe("pagamento");
    expect(result.state).not.toBe("pedido_realizado");
    expect(result.allowQualification).toBe(false);
  });

  it("a broad how/which question no longer keeps sticky payment continuity", () => {
    const previous = deriveBusinessDecisionV3({ message: "quero pagar" });
    const current = deriveBusinessDecisionV3({ message: "como funciona esse serviço no Spotify?" });
    const result = reconcileBusinessDecisionV3({ previous, current, message: "como funciona esse serviço no Spotify?" });
    expect(result.state).toBe("descoberta");
  });

  it("fails closed on unsupported commercial claims in runtime", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/agent-v3/orchestrator.server.ts"), "utf8");
    expect(source).toContain("Preço sem autoridade literal bloqueado");
    expect(source).toContain("Expansão absoluta de permanência bloqueada");
    expect(source).toContain("Decomposição de SKU combinado bloqueada");
    expect(source).toContain("Promessa de algoritmo sem autoridade bloqueada");
    expect(source).not.toContain("entre 500 e 650 plays por dia");
    expect(source).not.toContain("pode ser proporção calculada corretamente");
  });

  it("current financial/temporal deferral lowers stale closing intelligence", () => {
    const result = applyBusinessDecisionToIntelligence({
      state: "adiado",
      currentProb: 95,
    });
    expect(result.purchase_probability).toBe(39);
    expect(result.temperature).toBe("frio");
  });

  it("confirmed purchase promotes persistent CRM temperature to cliente", () => {
    expect(derivePersistentContactTemperatureV3({
      current: "quente",
      businessState: "pedido_realizado",
      purchaseProbability: 100,
    })).toBe("cliente");

    expect(derivePersistentContactTemperatureV3({
      current: "quente",
      businessState: "pos_venda",
      purchaseProbability: 65,
    })).toBe("cliente");
  });

  it("cliente is monotonic even when a later commercial turn looks colder", () => {
    expect(derivePersistentContactTemperatureV3({
      current: "cliente",
      businessState: "descoberta",
      purchaseProbability: 20,
      intelligenceTemperature: "frio",
    })).toBe("cliente");
  });

  it("price research alone stays orçamento instead of payment", () => {
    const d = deriveBusinessDecisionV3({
      message: "Quanto custa por música e quais formas de pagamento vocês aceitam?",
      recentCustomerMessages: [],
      customerLifecycle: "lead",
    });
    expect(d.state).toBe("orcamento");
  });

  it("does not advance unpublished content to payment even when price/payment is discussed", () => {
    const d = deriveBusinessDecisionV3({
      message: "Ainda não lancei minhas músicas no Spotify. Quanto custa e como é o pagamento?",
      recentCustomerMessages: [],
      customerLifecycle: "lead",
    });
    expect(d.state).toBe("descoberta");
    expect(d.allowQualification).toBe(false);
    expect(d.nextAction).toMatch(/aguardar.*(?:lançado|publicado)|conteúdo.*(?:lançado|publicado)/i);
  });

  it("resolves distribution confusion before an operational payment request", () => {
    const d = deriveBusinessDecisionV3({
      message: "Manda o Pix aí que eu vou mandar a música para vocês",
      recentCustomerMessages: [],
      customerLifecycle: "lead",
    });
    expect(d.state).toBe("descoberta");
    expect(d.reason).toContain("confusao");
    expect(d.nextAction).toMatch(/aguardar.*(?:lançado|publicado)|conteúdo.*(?:lançado|publicado)/i);
  });

  it("persists confirmed purchase facts and exposes them as post-sale generation context", () => {
    const beforePayment = deriveOrderContextV3(
      "Quero 1000 plays no Spotify",
      [],
      EMPTY_ORDER_CONTEXT,
    );
    const paid = deriveOrderContextV3(
      "Pagamento feito",
      [],
      beforePayment,
    );
    const laterTurn = deriveOrderContextV3(
      "Que painel como assim?",
      [],
      paid,
    );

    expect(paid.paymentStatus).toBe("confirmado_pelo_cliente");
    expect(laterTurn.paymentStatus).toBe("confirmado_pelo_cliente");
    expect(laterTurn.platform).toBe(beforePayment.platform);
    expect(laterTurn.service).toBe(beforePayment.service);
    expect(laterTurn.quantity).toBe(1000);

    const prompt = orderContextSummaryV3(laterTurn);
    expect(prompt).toContain("trate como pós-venda");
    expect(prompt).toContain("Não volte a qualificar");
    expect(prompt).toContain("quantidade: 1000");
  });

  it("injects deterministic order context into the generation prompt", () => {
    const source = readFileSync(
      join(process.cwd(), "src/lib/agent-v3/orchestrator.server.ts"),
      "utf8",
    );
    expect(source).toContain("orderContextSummaryV3(updatedOrderContext)");
    expect(source).toContain("${deterministicOrderContextPrompt}");
    expect(source).toContain("OrderContext agora entra no prompt");
  });

  it("02/10 case 44835247550658: published-later callback becomes waiting/adiado", () => {
    const d = deriveBusinessDecisionV3({
      message: "Ótimo. Terminando de gravar o clipe. Assim que subir falo com vcs",
    });
    expect(d.state).toBe("adiado");
    expect(d.allowQualification).toBe(false);
    expect(d.waitingCustomer).toBe(true);
  });

  it("02/10 case 95361276346534: studying now pauses qualification and polite thanks does not reopen it", () => {
    const deferred = deriveBusinessDecisionV3({ message: "Então estamos estudando ainda" });
    expect(deferred.state).toBe("adiado");
    const thanks = deriveBusinessDecisionV3({ message: "Mas agradeço" });
    const reconciled = reconcileBusinessDecisionV3({
      previous: deferred,
      current: thanks,
      message: "Mas agradeço",
    });
    expect(reconciled.state).toBe("adiado");
    expect(reconciled.allowQualification).toBe(false);
    expect(reconciled.waitingCustomer).toBe(true);
  });

  it("02/10 case 215470187774134: scheduled continuation after 19h is operationally deferred", () => {
    const previous = deriveBusinessDecisionV3({
      message: "Ok só preciso me organizar financeiramente",
    });
    const current = deriveBusinessDecisionV3({
      message: "Ok então continuamos hoje após as 19 horas e muito obrigado",
    });
    const d = reconcileBusinessDecisionV3({
      previous,
      current,
      message: "Ok então continuamos hoje após as 19 horas e muito obrigado",
    });
    expect(d.state).toBe("adiado");
    expect(d.allowQualification).toBe(false);
    expect(deriveBusinessDecisionV3({ message: "Continuamos hoje após as 9 horas" }).state).toBe("adiado");
    expect(deriveBusinessDecisionV3({ message: "Continuamos hoje após as 19 horas" }).state).toBe("adiado");
    expect(applyBusinessDecisionToIntelligence({ state: d.state, currentProb: 80 })).toMatchObject({
      temperature: "frio",
      purchase_probability: 39,
    });
  });

  it("02/10 case 49035691978975: tomorrow callback wins over qualification and social close stays deferred", () => {
    const deferred = deriveBusinessDecisionV3({ message: "Eu vou ver até amanhã. Aí eu te falo" });
    expect(deferred.state).toBe("adiado");
    const social = deriveBusinessDecisionV3({ message: "Beleza obrigado eu vou olhar aqui direitinho e te falo" });
    const d = reconcileBusinessDecisionV3({
      previous: deferred,
      current: social,
      message: "Beleza obrigado eu vou olhar aqui direitinho e te falo",
    });
    expect(d.state).toBe("adiado");
    expect(d.allowQualification).toBe(false);
    expect(d.waitingCustomer).toBe(true);
  });

  it("locks direct-question, pause and complete-closing behavior into the shared P1 brain", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/agent-v3/prompt/prompt-p1.server.ts"), "utf8");
    expect(source).toContain("DÚVIDA DE PAGAMENTO NÃO EXIGE QUALIFICAÇÃO PRÉVIA");
    expect(source).toContain("ADIAMENTO/PAUSA É SOBERANO NO TURNO");
    expect(source).toContain("FECHAMENTO SINTÁTICO");
    expect(source).toContain("Não reabra a venda nem a qualificação");
  });

  it("02/10 case 260691730669767: quantity per day is not provider delivery speed and raw catalog metadata is blocked", () => {
    const prompt = readFileSync(join(process.cwd(), "src/lib/agent-v3/prompt/prompt-p1.server.ts"), "utf8");
    const runtime = readFileSync(join(process.cwd(), "src/lib/agent-v3/orchestrator.server.ts"), "utf8");
    expect(prompt).toContain("QUANTIDADE DO PEDIDO ≠ VELOCIDADE DE ENTREGA");
    expect(prompt).toContain("ele pode fazer um pedido de 500 por dia");
    expect(prompt).toContain("METADADOS DO CATÁLOGO SÃO INTERNOS");
    expect(runtime).toContain("Dump cru de metadados do catálogo bloqueado");
  });

  it("02/10 cases 224059954561262/157810637697184: unpublished content blocks qualification", () => {
    for (const message of [
      "Ainda não conseguir colocar minhas músicas em plataformas",
      "Ainda não consegui colocar minhas músicas em plataformas",
      "Não consegui publicar minhas músicas no Spotify",
    ]) {
      const d = deriveBusinessDecisionV3({ message });
      expect(d.state).toBe("descoberta");
      expect(d.allowQualification).toBe(false);
      expect(d.nextAction).toMatch(/aguardar.*(?:lançado|publicado)|conteúdo.*(?:lançado|publicado)/i);
    }
  });

  it("02/10 cases 20/21: shared brain forbids third-party capability guesses and revenue promises", () => {
    const prompt = readFileSync(join(process.cwd(), "src/lib/agent-v3/prompt/prompt-p1.server.ts"), "utf8");
    const runtime = readFileSync(join(process.cwd(), "src/lib/agent-v3/orchestrator.server.ts"), "utf8");
    expect(prompt).toContain("BLOCKER DE PUBLICAÇÃO É SOBERANO");
    expect(prompt).toContain("não atribua capacidade a empresa, editora, gravadora ou distribuidora");
    expect(prompt).toContain("mais plays = mais dinheiro");
    expect(runtime).toContain("Promessa de renda/royalties sem autoridade bloqueada");
  });

  it("02/10 case 34991803265275: entering the panel after welcome funnel does not reopen qualification", () => {
    const d = deriveBusinessDecisionV3({
      message: "Vou entrar agora",
      recentCustomerMessages: ["Olá! Tenho interesse em divulgar minha música."],
    });
    expect(d.state).toBe("fechamento");
    expect(d.allowQualification).toBe(false);
    expect(d.waitingCustomer).toBe(true);
    expect(d.nextAction).toContain("não perguntar plataforma");

    const prompt = readFileSync(join(process.cwd(), "src/lib/agent-v3/prompt/prompt-p1.server.ts"), "utf8");
    expect(prompt).toContain("CONTINUIDADE APÓS FUNIL/SITE/PAINEL");
    expect(prompt).toContain("CONTEXTO DO FUNIL NÃO ZERA");
    expect(prompt).toContain("PROIBIDO perguntar novamente qual plataforma");
    expect(prompt).toContain("Nunca invente a plataforma quando ela não estiver presente");
  });

  it("03/10 case 23: purchase instructions explain the process and isolate the panel link", () => {
    const prompt = readFileSync(join(process.cwd(), "src/lib/agent-v3/prompt/prompt-p1.server.ts"), "utf8");
    expect(prompt).toContain("COMO COMPRAR / COMO FAZER O PEDIDO");
    expect(prompt).toContain("Não responda apenas com a URL");
    expect(prompt).toContain("LINK DO PAINEL SEMPRE EM BOLHA PRÓPRIA");
    expect(prompt).toContain("===SPLIT===");
    expect(prompt).toContain("depois apenas https://mindsmmpanel.com");
    expect(prompt).toContain("sem texto, emoji ou pontuação na mesma mensagem");
    expect(prompt).toContain("criar a conta com qualquer e-mail e senha");
    expect(prompt).toContain("NÃO usamos a senha da rede social");
    expect(prompt).toContain("fazer uma recarga na conta via PIX");
    expect(prompt).toContain("a recarga da conta vem antes");
    expect(prompt).toContain("Não use travessão longo (—) nas respostas ao cliente");
  });

  it("07/10 case 5511970116430: greeting after 24h reopens service even when funnel was completed", () => {
    const base = {
      isFirstTurn: false,
      funnelAlreadyCompleted: true,
      resumedAfterInactivity: true,
    };

    expect(routeMessage("Bom dia", base).response).toBe("Bom dia, como posso ajudar?");
    expect(routeMessage("Boa tarde", base).response).toBe("Boa tarde, como posso ajudar?");
    expect(routeMessage("Boa noite", base).response).toBe("Boa noite, como posso ajudar?");
  });

  it("07/10 greeting regression: immediate post-funnel greeting stays short and a greeting with a question is not swallowed", () => {
    expect(routeMessage("Bom dia", {
      isFirstTurn: false,
      funnelAlreadyCompleted: true,
      resumedAfterInactivity: false,
    }).response).toBe("Bom dia!");

    const withQuestion = routeMessage("Bom dia, quanto custa 1000 plays?", {
      isFirstTurn: false,
      funnelAlreadyCompleted: true,
      resumedAfterInactivity: true,
    });
    expect(withQuestion.handled).toBe(false);
    expect(withQuestion.route).toBe("claude");
  });

  it("07/10 inactivity signal comes from durable 24h reset in the shared execution brain", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/agent-v3/core/execute-agent.server.ts"), "utf8");
    expect(source).toContain('input.historyTelemetry?.session_reset_reason === "inactivity_24h"');
    expect(source).toContain("resumedAfterInactivity:");
  });

  it("07/10 greeting plus a real question after 24h may greet naturally without losing the question", () => {
    const state = detectConversationState({
      message: "Bom dia, quanto custa 1000 plays?",
      history: [],
      greetingAlreadyPerformed: true,
      sessionResetReason: "inactivity_24h",
    });
    expect(state.sessionRestart).toBe(true);
    expect(state.resumedWithGreeting).toBe(true);
    expect(state.greetingAlreadyDone).toBe(false);

    const orchestrator = readFileSync(join(process.cwd(), "src/lib/agent-v3/orchestrator.server.ts"), "utf8");
    expect(orchestrator).toContain("sessionResetReason: historyTelemetry?.session_reset_reason");
  });

  it("07/10 case 233693683699742: order ID is deterministic proof of post-sale", () => {
    const first = deriveBusinessDecisionV3({
      message: "O pedido1124998 ainda não foi concluído correto, pois não entrou ainda as visualizações",
      recentCustomerMessages: ["Boa tarde!"],
    });
    expect(first.state).toBe("pos_venda");
    expect(first.allowQualification).toBe(false);
    expect(first.nextAction).toContain("nunca perguntar se o pedido foi pago");

    const status = deriveBusinessDecisionV3({
      message: "In progress significa o que?",
      recentCustomerMessages: ["O pedido1124998", "Ainda não foi concluído correto", "Pois não entrou ainda as visualizações"],
    });
    expect(status.state).toBe("pos_venda");
    expect(status.allowQualification).toBe(false);
  });

  it("07/10 case 233693683699742: post-sale cannot regress to account creation after short follow-up", () => {
    const previous = deriveBusinessDecisionV3({
      message: "O pedido1124998",
      recentCustomerMessages: [],
    });
    expect(previous.state).toBe("pos_venda");

    const shortFollowup = deriveBusinessDecisionV3({
      message: "Está na imagem",
      recentCustomerMessages: ["O pedido1124998", "In progress significa o que?", "2550"],
    });
    const reconciled = reconcileBusinessDecisionV3({
      previous,
      current: shortFollowup,
      message: "Está na imagem",
    });
    expect(reconciled.state).toBe("pos_venda");
    expect(reconciled.allowQualification).toBe(false);
    expect(reconciled.nextAction).toContain("não reabrir aquisição");

    const orchestrator = readFileSync(join(process.cwd(), "src/lib/agent-v3/orchestrator.server.ts"), "utf8");
    expect(orchestrator).toContain("[AGENT-V3-POSTSALE-GUARD]");
    expect(orchestrator).toContain("Resposta de aquisição bloqueada em pós-venda");
  });

  it("07/10 case 233693683699742: existing order screenshot stays post-sale and never requalifies", () => {
    const prompt = readFileSync(join(process.cwd(), "src/lib/agent-v3/prompt/prompt-p1.server.ts"), "utf8");
    expect(prompt).toContain("SUPORTE DE PEDIDO JÁ CRIADO É PÓS-VENDA");
    expect(prompt).toContain("PRINT/IMAGEM É CONTEXTO");
    expect(prompt).toContain('STATUS "IN PROGRESS"');
    expect(prompt).toContain("não dá para afirmar o prazo exato");
    expect(prompt).toContain("Não faça nova pergunta, não qualifique, não ofereça compra e não envie link do painel");
  });

  it("locks commercial authority rules into P1", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/agent-v3/prompt/prompt-p1.server.ts"), "utf8");
    expect(source).toContain("Nunca derive \"500 = metade do preço de 1000\"");
    expect(source).toContain("nunca decomponha \"Plays + Ouvintes\"");
    expect(source).toContain("não invente preço proporcional para uma quantidade intermediária");
    expect(source).toContain("nunca traduza \"vitalício\"");
    expect(source).toContain("SPOTIFY/ALGORITMO/RENDA");
    expect(source).toContain("intenção de pagar não elimina pré-requisitos");
    expect(source).toContain("Short não é Live");
  });

  it("07/10 order context: order ID also confirms payment in shared memory", () => {
    const order = deriveOrderContextV3("O pedido1124998 ainda está In progress", []);
    expect(order.paymentStatus).toBe("confirmado_pelo_cliente");
  });

  it("07/10 playground lifecycle: durable 24h signal is explicitly reproducible", () => {
    const playground = readFileSync(join(process.cwd(), "src/lib/agent-v3/admin/playground.functions.ts"), "utf8");
    expect(playground).toContain("simulateInactivityHours");
    expect(playground).toContain('simulateInactivityHours >= 24 ? "inactivity_24h"');
    expect(playground).toContain("historyTelemetry:");
  });

});
