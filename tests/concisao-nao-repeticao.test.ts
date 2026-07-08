/**
 * Guardrail textual da REGRA_CONCISAO_BLOCK_EXTRA.
 *
 * Não valida comportamento do LLM (isso depende do modelo). Valida que o
 * reforço textual está presente no system prompt montado, cobrindo os
 * dois cenários da regressão real (conversa 6a5ed8e3, 08/07 01:15 UTC):
 *
 *   Turno 1 — cliente relata atraso → Júlia orienta abrir ticket.
 *   A resposta trazia a MESMA orientação parafraseada 2x na mesma msg.
 *
 *   Turno 2 (<1 min depois) — cliente responde "não mudou nada" sem
 *   confirmar que abriu o ticket → Júlia repetia "abre um ticket" de
 *   novo em vez de investigar.
 */
import { describe, expect, it } from "vitest";
import {
  REGRA_CONCISAO_BLOCK_EXTRA,
  buildSharedRules,
  MIND_BRAND_TEMPLATE,
} from "@/lib/agent-identity.server";

describe("REGRA_CONCISAO_BLOCK_EXTRA — não-repetição", () => {
  it("cobre INTRA-RESPOSTA: proíbe parafrasear a mesma orientação na mesma mensagem", () => {
    expect(REGRA_CONCISAO_BLOCK_EXTRA).toMatch(/INTRA-RESPOSTA/);
    expect(REGRA_CONCISAO_BLOCK_EXTRA).toMatch(/mesma orientação/i);
    expect(REGRA_CONCISAO_BLOCK_EXTRA).toMatch(/mesma mensagem/i);
    expect(REGRA_CONCISAO_BLOCK_EXTRA).toMatch(/abre um ticket/i);
  });

  it("cobre ENTRE TURNOS CURTOS: proíbe repetir orientação <1min sem confirmação do cliente", () => {
    expect(REGRA_CONCISAO_BLOCK_EXTRA).toMatch(/ENTRE TURNOS CURTOS/);
    expect(REGRA_CONCISAO_BLOCK_EXTRA).toMatch(/menos de 1 minuto/i);
    expect(REGRA_CONCISAO_BLOCK_EXTRA).toMatch(/sinaliz/i);
    expect(REGRA_CONCISAO_BLOCK_EXTRA).toMatch(/investig/i);
    expect(REGRA_CONCISAO_BLOCK_EXTRA).toMatch(/print|evid[eê]ncia|ID do pedido/i);
  });

  it("está incluído no system prompt montado por buildSharedRules", () => {
    const shared = buildSharedRules(MIND_BRAND_TEMPLATE);
    expect(shared).toContain(REGRA_CONCISAO_BLOCK_EXTRA);
    // sanity — o bloco original de concisão continua presente também
    expect(shared).toMatch(/REGRA DE CONCISÃO/);
  });

  it("traz exemplo negativo que reproduz exatamente o cenário observado (frustração + follow-up rápido)", () => {
    // Turno 2 do incidente real
    expect(REGRA_CONCISAO_BLOCK_EXTRA).toMatch(/n[aã]o mudou nada/i);
    expect(REGRA_CONCISAO_BLOCK_EXTRA).toMatch(/Entendo sua frustra/i);
  });
});