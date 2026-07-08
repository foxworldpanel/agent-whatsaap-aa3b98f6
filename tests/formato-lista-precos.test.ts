/**
 * Guardrail textual da REGRA_FORMATO_LISTA_PRECOS_BLOCK.
 *
 * Valida que quando a Júlia apresenta 2+ opções de quantidade/preço,
 * a resposta deve usar formato de lista alinhada (uma linha por opção),
 * não texto corrido com vírgulas.
 */
import { describe, expect, it } from "vitest";
import {
  REGRA_FORMATO_LISTA_PRECOS_BLOCK,
  buildSharedRules,
  DEFAULT_IDENTITY,
} from "@/lib/agent-identity.server";

describe("REGRA_FORMATO_LISTA_PRECOS_BLOCK — lista alinhada de preços", () => {
  it("obriga formato de lista quando há 2+ opções de quantidade/preço", () => {
    expect(REGRA_FORMATO_LISTA_PRECOS_BLOCK).toMatch(/2 OU MAIS opções/i);
    expect(REGRA_FORMATO_LISTA_PRECOS_BLOCK).toMatch(/uma opção por linha/i);
    expect(REGRA_FORMATO_LISTA_PRECOS_BLOCK).toMatch(
      /\{Quantidade\} \{Nome do serviço\} - R\$ \{valor\}/,
    );
  });

  it("traz exemplo ERRADO (texto corrido) e CERTO (lista alinhada)", () => {
    expect(REGRA_FORMATO_LISTA_PRECOS_BLOCK).toMatch(/Exemplo ERRADO/);
    expect(REGRA_FORMATO_LISTA_PRECOS_BLOCK).toMatch(/Exemplo CERTO/);

    // Valida a ESTRUTURA dos exemplos, não valores específicos (que podem
    // mudar conforme tabela de preços real).
    const errado = REGRA_FORMATO_LISTA_PRECOS_BLOCK.match(
      /Exemplo ERRADO[^\n]*\n+"([^"]+)"/,
    )?.[1];
    const certo = REGRA_FORMATO_LISTA_PRECOS_BLOCK.match(
      /Exemplo CERTO[^\n]*\n+"([\s\S]+?)"/,
    )?.[1];

    expect(errado, "trecho do Exemplo ERRADO não encontrado").toBeDefined();
    expect(certo, "trecho do Exemplo CERTO não encontrado").toBeDefined();

    // ERRADO: texto corrido — 2+ pares "R$ <valor>" numa única linha.
    const erradoPrecos = (errado!.match(/R\$\s?\d+/g) ?? []).length;
    expect(erradoPrecos).toBeGreaterThanOrEqual(2);
    expect(errado!.split("\n").length).toBe(1);

    // CERTO: lista alinhada — 2+ linhas no padrão "<quantidade> <serviço> - R$ <valor>".
    const linhasLista = certo!
      .split("\n")
      .filter((l) => /^\s*\d+\s+\S.*-\s*R\$\s?\d+/.test(l));
    expect(linhasLista.length).toBeGreaterThanOrEqual(2);
  });

  it("vale para qualquer rede, não só Spotify", () => {
    expect(REGRA_FORMATO_LISTA_PRECOS_BLOCK).toMatch(/QUALQUER rede/i);
    expect(REGRA_FORMATO_LISTA_PRECOS_BLOCK).toMatch(/YouTube.*Instagram.*TikTok/i);
  });

  it("mantém frase corrida quando há apenas 1 preço/quantidade", () => {
    expect(REGRA_FORMATO_LISTA_PRECOS_BLOCK).toMatch(/apenas 1 preço\/quantidade/i);
    expect(REGRA_FORMATO_LISTA_PRECOS_BLOCK).toMatch(/frase corrida normal/i);
  });

  it("preserva REGRA DE SPLIT: a lista fica em uma única bolha", () => {
    expect(REGRA_FORMATO_LISTA_PRECOS_BLOCK).toMatch(/REGRA DE SPLIT/);
    expect(REGRA_FORMATO_LISTA_PRECOS_BLOCK).toMatch(/nunca quebre a lista/i);
  });

  it("está incluído no system prompt montado por buildSharedRules", () => {
    const shared = buildSharedRules(DEFAULT_IDENTITY);
    expect(shared).toContain(REGRA_FORMATO_LISTA_PRECOS_BLOCK);
  });
});