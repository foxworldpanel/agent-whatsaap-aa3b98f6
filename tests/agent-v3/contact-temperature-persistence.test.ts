import { describe, expect, it } from "vitest";
import { derivePersistentContactTemperatureV3 } from "../../src/lib/agent-v3/memory/contact-temperature.server";

describe("Temperatura persistente do CRM", () => {
  it("lead com orçamento vira morno", () => {
    expect(
      derivePersistentContactTemperatureV3({
        current: "frio",
        businessState: "orcamento",
        purchaseProbability: 50,
      }),
    ).toBe("morno");
  });

  it("fechamento/pagamento vira quente", () => {
    expect(
      derivePersistentContactTemperatureV3({
        current: "frio",
        businessState: "pagamento",
        purchaseProbability: 90,
      }),
    ).toBe("quente");
  });

  it("cliente confirmado vira cliente", () => {
    expect(
      derivePersistentContactTemperatureV3({
        current: "quente",
        lifecycle: "cliente",
        purchaseCount: 1,
      }),
    ).toBe("cliente");
  });

  it("quente não regride para frio por uma mensagem isolada", () => {
    expect(
      derivePersistentContactTemperatureV3({
        current: "quente",
        businessState: "descoberta",
        intelligenceTemperature: "frio",
        purchaseProbability: 20,
      }),
    ).toBe("quente");
  });

  it("bloqueado nunca é sobrescrito automaticamente", () => {
    expect(
      derivePersistentContactTemperatureV3({
        current: "bloqueado",
        businessState: "pagamento",
        intelligenceTemperature: "quente",
        purchaseProbability: 95,
      }),
    ).toBe("bloqueado");
  });

  it("produto + plataforma já conhecidos impedem lead totalmente frio", () => {
    expect(
      derivePersistentContactTemperatureV3({
        current: "frio",
        businessState: "descoberta",
        hasPlatform: true,
        hasProduct: true,
      }),
    ).toBe("morno");
  });
});
