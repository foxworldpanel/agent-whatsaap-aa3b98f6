/**
 * Guardrail da REGRA_SUPORTE_PROBLEMA_BLOCK (versão simplificada).
 *
 * Regra atual: qualquer reclamação de pedido/entrega/reposição → ticket
 * direto na primeira menção. Sem pedir print antes, sem investigar via
 * WhatsApp. Print continua valendo para OUTROS contextos (pagamento,
 * erro no cadastro, dúvida de UI).
 */
import { describe, expect, it } from "vitest";
import {
  REGRA_SUPORTE_PROBLEMA_BLOCK,
  buildSharedRules,
  DEFAULT_IDENTITY,
  MIND_BRAND_TEMPLATE,
  mergeIdentity,
} from "@/lib/agent-identity.server";

describe("REGRA_SUPORTE_PROBLEMA_BLOCK (ticket direto)", () => {
  it("orienta ticket JÁ NA PRIMEIRA RESPOSTA", () => {
    expect(REGRA_SUPORTE_PROBLEMA_BLOCK).toMatch(/PRIMEIRA (RESPOSTA|MENÇÃO)/i);
    expect(REGRA_SUPORTE_PROBLEMA_BLOCK).toMatch(/abre um ticket no menu Suporte/i);
    expect(REGRA_SUPORTE_PROBLEMA_BLOCK).toMatch(/informa o ID do pedido/i);
    expect(REGRA_SUPORTE_PROBLEMA_BLOCK).toMatch(/reposição ou reembolso em saldo/i);
  });

  it("proíbe pedir print para investigar reclamação de pedido", () => {
    expect(REGRA_SUPORTE_PROBLEMA_BLOCK).toMatch(/PROIBIDO ABSOLUTO/i);
    expect(REGRA_SUPORTE_PROBLEMA_BLOCK).toMatch(/Pedir PRINT do pedido/i);
    expect(REGRA_SUPORTE_PROBLEMA_BLOCK).toMatch(/sem pedir print antes/i);
  });

  it("preserva análise de imagem para outros contextos operacionais", () => {
    expect(REGRA_SUPORTE_PROBLEMA_BLOCK).toMatch(/EXCEÇÃO IMPORTANTE/i);
    expect(REGRA_SUPORTE_PROBLEMA_BLOCK).toMatch(/pagamento|cadastro\/login|UI do painel/i);
  });

  it("mantém política de reembolso só em saldo", () => {
    expect(REGRA_SUPORTE_PROBLEMA_BLOCK).toMatch(/nunca em dinheiro/i);
  });

  it("está injetado no system prompt via buildSharedRules", () => {
    const shared = buildSharedRules(DEFAULT_IDENTITY);
    expect(shared).toContain(REGRA_SUPORTE_PROBLEMA_BLOCK);
  });
});

describe("MIND_BRAND_TEMPLATE.persona alinhado com ticket direto", () => {
  it("persona não instrui mais pedir print antes do ticket em reclamação de pedido", () => {
    expect(MIND_BRAND_TEMPLATE.persona).not.toMatch(/primeiro peça PRINT do histórico/i);
    expect(MIND_BRAND_TEMPLATE.persona).not.toMatch(/Me manda um print do pedido no histórico/i);
  });

  it("persona orienta ticket direto informando o ID dentro do ticket", () => {
    expect(MIND_BRAND_TEMPLATE.persona).toMatch(/JÁ NA PRIMEIRA RESPOSTA/i);
    expect(MIND_BRAND_TEMPLATE.persona).toMatch(/ID do pedido DENTRO do ticket/i);
  });

  it("shared prompt (persona Mind mesclada) contém a regra simplificada", () => {
    const identity = mergeIdentity({ persona: MIND_BRAND_TEMPLATE.persona });
    const shared = buildSharedRules(identity);
    expect(shared).toMatch(/abre um ticket no menu Suporte/i);
    expect(shared).not.toMatch(/primeiro peça PRINT do histórico/i);
  });
});
