import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("Agent V3 cost safeguards", () => {
  it("does not ask Claude to generate hidden lead-intelligence markers", () => {
    const source = read("src/lib/agent-v3/orchestrator.server.ts");
    expect(source).not.toContain("LEAD INTELLIGENCE (Obrigatório em toda resposta)");
    expect(source).not.toContain("[FEEDBACK:Item 1|Item 2|...]");
    expect(source).toContain("Gere somente a mensagem que será enviada ao cliente");
  });

  it("caps Anthropic output for short WhatsApp replies", () => {
    const source = read("src/lib/agent-v3/integrations/llm-client.server.ts");
    expect(source).toContain("max_tokens: 384");
  });

  it("limits playground history to the last 10 stored messages", () => {
    const source = read("src/lib/agent-v3/admin/playground.functions.ts");
    expect(source).toContain('.order("sequence", { ascending: false })');
    expect(source).toContain(".limit(10)");
    expect(source).toContain("[...messages].reverse()");
  });
});
