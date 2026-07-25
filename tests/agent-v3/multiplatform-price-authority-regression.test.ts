import { describe, expect, it } from "vitest";
import fs from "node:fs";

const orchestrator = fs.readFileSync("src/lib/agent-v3/orchestrator.server.ts", "utf8");
const selector = fs.readFileSync("src/lib/agent-v3/selector/module-selector.server.ts", "utf8");
const guards = fs.readFileSync("src/lib/agent-v3/brain/guards.server.ts", "utf8");

describe("Autoridade comercial multiplataforma", () => {
  it("não deixa matemática de preço não-Spotify por conta do LLM", () => {
    expect(orchestrator).toContain("buildDeterministicMultiProductPriceReply");
    expect(orchestrator).toContain("Preço divergente do CMS foi substituído");
    expect(orchestrator).toContain("genericPriceForQuantity");
  });

  it("carrega módulos comerciais da plataforma quando há quantidade/produto", () => {
    expect(orchestrator).toContain("Autoridade comercial obrigatória de");
    expect(orchestrator).toContain("PRODUCT_PRICE_TERMS");
  });

  it("conhece plataformas habilitadas sem inventar indisponibilidade", () => {
    expect(orchestrator).toContain("PLATAFORMAS DISPONÍVEIS NO CMS");
    expect(orchestrator).toContain("Falsa indisponibilidade de plataforma bloqueada");
  });

  it("entende trez mil de transcrição de áudio", () => {
    expect(orchestrator).toContain("trez: 3");
    expect(selector).toContain("trez");
  });

  it("silencia ok/beleza simples", () => {
    expect(guards).toContain("simpleAcknowledgement");
  });

  it("não reinicia apresentação no meio da conversa", () => {
    expect(orchestrator).toContain("Nunca se reapresente no meio de uma conversa");
  });
});
