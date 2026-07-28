import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { detectConversationContext } from "../../src/lib/agent-v3/selector/module-selector.server";

const webhook = fs.readFileSync("src/routes/api/public/hooks/uazapi-webhook.ts", "utf8");
const orchestrator = fs.readFileSync("src/lib/agent-v3/orchestrator.server.ts", "utf8");

describe("Caso real: funil, link e inteligência acumulada", () => {
  it("preserva fechamento em mensagem curta após Spotify + plays + quantidade", () => {
    const history = [
      { role: "customer" as const, content: "Ja tenho músicas no Spotify" },
      { role: "customer" as const, content: "Plays" },
      { role: "customer" as const, content: "Preciso de 1000" },
      { role: "customer" as const, content: "Coração Acelerado" },
      { role: "customer" as const, content: "1000" },
      { role: "customer" as const, content: "Dependendo aumentamos" },
    ];
    const ctx = detectConversationContext("Ok", history);
    expect(ctx.platform).toBe("spotify");
    expect(ctx.product).toBe("plays");
    expect(ctx.hasQuantity).toBe(true);
    expect(ctx.intent).toBe("compra");
    expect(ctx.stage).toBe("fechamento");
  });

  it("valida track vs user no Spotify", () => {
    expect(orchestrator).toContain("open.spotify.com/track/");
    expect(orchestrator).toContain("Não oriente usar link de usuário/perfil");
  });

  it("interrompe etapas restantes se cliente pedir para falar depois", () => {
    expect(webhook).toContain("isConversationDeferralMessage");
    expect(webhook).not.toContain("WELCOME_FUNNEL_CANCELLED_BY_CUSTOMER_DEFERRAL");
    expect(webhook).toContain("welcome funnel paused by customer");
  });

  it("mantém funil uma vez para cliente normal", () => {
    expect(webhook).toContain("existingRun normal = cliente já recebeu este funil; segue para Agent V3");
    expect(webhook).toContain("WELCOME_FUNNEL_REPEAT_TEST_PHONES");
  });
});
