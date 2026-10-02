import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deriveBusinessDecisionV3, reconcileBusinessDecisionV3 } from "../src/lib/agent-v3/brain/business-state.server";
import { applyBusinessDecisionToIntelligence } from "../src/lib/agent-v3/core/intelligence-utils.server";
import { derivePersistentContactTemperatureV3 } from "../src/lib/agent-v3/memory/contact-temperature.server";

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

  it("locks commercial authority rules into P1", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/agent-v3/prompt/prompt-p1.server.ts"), "utf8");
    expect(source).toContain("Nunca derive \"500 = metade do preço de 1000\"");
    expect(source).toContain("nunca decomponha \"Plays + Ouvintes\"");
    expect(source).toContain("não criar tier, mínimo, desconto ou quantidade intermediária");
    expect(source).toContain("nunca traduza \"vitalício\"");
    expect(source).toContain("SPOTIFY/ALGORITMO/RENDA");
    expect(source).toContain("intenção de pagar não elimina pré-requisitos");
    expect(source).toContain("Short não é Live");
  });
});
