import { describe, expect, it } from "vitest";
import { deriveBusinessDecisionV3 } from "../../src/lib/agent-v3/brain/business-state.server";
import fs from "node:fs";

const orchestrator = fs.readFileSync("src/lib/agent-v3/orchestrator.server.ts", "utf8");

describe("Spotify playlist real closing case", () => {
  it("track link após escolha de playlist é fechamento, não lead frio", () => {
    const d = deriveBusinessDecisionV3({
      message: "https://open.spotify.com/track/5yY13puHFAcFag55k4qOTm",
      recentCustomerMessages: [
        "Playlist",
        "Sertanejo",
        "Arrocha",
        "https://open.spotify.com/album/0uTmRDfM9Kk6Ml5pbzXWH4",
      ],
    });

    expect(d.state).toBe("fechamento");
    expect(d.allowQualification).toBe(false);
  });

  it("orchestrator força evidência objetiva a no mínimo 85%", () => {
    expect(orchestrator).toContain("objectiveClosingEvidence");
    expect(orchestrator).toContain("purchase_probability = Math.max(purchase_probability, 85)");
    expect(orchestrator).toContain('intent = "Compra"');
    expect(orchestrator).toContain('stage = selectionContext.hasPaymentSignal ? "Pagamento" : "Fechamento"');
  });

  it("business decision é recebido de forma estruturada antes de salvar telemetria", () => {
    expect(orchestrator).toContain("businessDecision?: BusinessDecisionV3");
    expect(orchestrator).toContain("if (businessDecision)");
  });
});
