import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { shouldStaySilentForNaturalConversation } from "../../src/lib/agent-v3/brain/guards.server";
const orchestrator = fs.readFileSync("src/lib/agent-v3/orchestrator.server.ts","utf8");
const runtime = fs.readFileSync("src/lib/agent-v3/runtime.server.ts","utf8");
describe("Naturalidade V3", () => {
  it("silencia pausa natural", () => expect(shouldStaySilentForNaturalConversation({message:"Vou olhar como funciona no vídeo",history:[]})).toBe(true));
  it("não silencia pergunta", () => expect(shouldStaySilentForNaturalConversation({message:"Vou olhar, mas onde faço o Pix?",history:[]})).toBe(false));
  it("não silencia problema", () => expect(shouldStaySilentForNaturalConversation({message:"Não consegui fazer o pedido",history:[]})).toBe(false));
  it("tem regras anti-robô", () => expect(orchestrator).toContain("NATURALIDADE CONVERSACIONAL — PRIORIDADE ALTA"));
  it("runtime suporta silêncio", () => expect(runtime).toContain("natural conversational silence"));
});
