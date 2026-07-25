import { describe, expect, it } from "vitest";
import fs from "node:fs";

const backend = fs.readFileSync("src/lib/dashboard.functions.ts", "utf8");
const dashboard = fs.readFileSync("src/routes/_authenticated/dashboard.tsx", "utf8");

describe("Dashboard V3 cost telemetry", () => {
  it("usa agent_v3_turn como fonte de custo", () => {
    expect(backend).toContain('.eq("type", "agent_v3_turn")');
    expect(backend).toContain("metadata.usage");
    expect(backend).toContain("metadata.cost");
  });

  it("não usa agent_prompt_metrics para custo V3", () => {
    expect(backend).not.toContain('.from("agent_prompt_metrics")');
  });

  it("agrega custo por resposta e conversa", () => {
    expect(backend).toContain("avgCostPerResponse");
    expect(backend).toContain("avgCostPerConversation");
    expect(backend).toContain("conversationIds");
  });

  it("inclui cache e modelos", () => {
    expect(backend).toContain("cache_read_input_tokens");
    expect(backend).toContain("cache_creation_input_tokens");
    expect(backend).toContain("modelCounts");
  });

  it("dashboard identifica custo como Claude V3", () => {
    expect(dashboard).toContain("Custo Claude V3 · 24h");
    expect(dashboard).toContain("Média por conversa");
    expect(dashboard).toContain("Média por resposta");
  });
});
