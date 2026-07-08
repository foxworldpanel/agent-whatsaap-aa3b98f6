/**
 * Anti-regressão: cliente manda "Boa tarde" seguido de "Como são os
 * seguidores Spotify?" em burst. A Júlia NÃO pode responder só à
 * saudação nem devolver a pergunta como confirmação.
 *
 * Guardrail textual — valida presença da regra no system prompt.
 */
import { describe, expect, it } from "vitest";
import {
  REGRA_SAUDACAO_COM_PERGUNTA_BLOCK,
  buildSharedRules,
  DEFAULT_IDENTITY,
} from "@/lib/agent-identity.server";

describe("REGRA_SAUDACAO_COM_PERGUNTA_BLOCK — burst saudação + pergunta real", () => {
  it("cobre AGRUPAMENTO: proíbe ignorar pergunta real quando vem junto com saudação", () => {
    expect(REGRA_SAUDACAO_COM_PERGUNTA_BLOCK).toMatch(/AGRUPAMENTO/);
    expect(REGRA_SAUDACAO_COM_PERGUNTA_BLOCK).toMatch(/burst|bloco/i);
    expect(REGRA_SAUDACAO_COM_PERGUNTA_BLOCK).toMatch(/Boa tarde/);
    expect(REGRA_SAUDACAO_COM_PERGUNTA_BLOCK).toMatch(/seguidores Spotify/i);
  });

  it("proíbe devolver a pergunta como pedido de confirmação", () => {
    expect(REGRA_SAUDACAO_COM_PERGUNTA_BLOCK).toMatch(/DEVOLVER A PERGUNTA/);
    expect(REGRA_SAUDACAO_COM_PERGUNTA_BLOCK).toMatch(/Você quer saber sobre/i);
    expect(REGRA_SAUDACAO_COM_PERGUNTA_BLOCK).toMatch(/PROIBIDO/);
  });

  it("cobre repetição do cliente como sinal de frustração", () => {
    expect(REGRA_SAUDACAO_COM_PERGUNTA_BLOCK).toMatch(/REPETE|frustra/i);
  });

  it("está incluído no system prompt montado por buildSharedRules", () => {
    const shared = buildSharedRules(DEFAULT_IDENTITY);
    expect(shared).toContain(REGRA_SAUDACAO_COM_PERGUNTA_BLOCK);
  });
});
