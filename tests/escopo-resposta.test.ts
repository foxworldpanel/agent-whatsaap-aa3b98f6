/**
 * Guardrail textual da REGRA_ESCOPO_RESPOSTA_BLOCK.
 *
 * Regressão real: cliente perguntou só sobre Spotify e a Júlia despejou
 * tabela completa (YouTube+Spotify+Instagram+TikTok) + parágrafo único
 * longo pra "tranquilizar cliente leigo".
 */
import { describe, expect, it } from "vitest";
import {
  REGRA_ESCOPO_RESPOSTA_BLOCK,
  buildSharedRules,
  DEFAULT_IDENTITY,
} from "@/lib/agent-identity.server";

describe("REGRA_ESCOPO_RESPOSTA_BLOCK — escopo e tamanho da resposta", () => {
  it("proíbe despejar tabela de todas as redes quando cliente perguntou de uma só", () => {
    expect(REGRA_ESCOPO_RESPOSTA_BLOCK).toMatch(/ESCOPO = PERGUNTA/);
    expect(REGRA_ESCOPO_RESPOSTA_BLOCK).toMatch(/YouTube.*Spotify.*Instagram.*TikTok/);
    expect(REGRA_ESCOPO_RESPOSTA_BLOCK).toMatch(/PROIBIDO/);
  });

  it("lista os gatilhos explícitos que liberam a tabela completa", () => {
    expect(REGRA_ESCOPO_RESPOSTA_BLOCK).toMatch(/manda a tabela/i);
    expect(REGRA_ESCOPO_RESPOSTA_BLOCK).toMatch(/tabela completa/i);
  });

  it("exige múltiplas bolhas via ===SPLIT=== em respostas de tranquilizar leigo", () => {
    expect(REGRA_ESCOPO_RESPOSTA_BLOCK).toMatch(/2-3 frases curtas/);
    expect(REGRA_ESCOPO_RESPOSTA_BLOCK).toMatch(/===SPLIT===/);
    expect(REGRA_ESCOPO_RESPOSTA_BLOCK).toMatch(/tranquilizar cliente leigo/i);
  });

  it("traz exemplo ERRADO (parágrafo único) e CERTO (bolhas curtas)", () => {
    expect(REGRA_ESCOPO_RESPOSTA_BLOCK).toMatch(/Exemplo ERRADO/);
    expect(REGRA_ESCOPO_RESPOSTA_BLOCK).toMatch(/Exemplo CERTO/);
    const splits = (REGRA_ESCOPO_RESPOSTA_BLOCK.match(/===SPLIT===/g) ?? []).length;
    expect(splits).toBeGreaterThanOrEqual(2);
  });

  it("está incluído no system prompt montado por buildSharedRules", () => {
    const shared = buildSharedRules(DEFAULT_IDENTITY);
    expect(shared).toContain(REGRA_ESCOPO_RESPOSTA_BLOCK);
  });
});