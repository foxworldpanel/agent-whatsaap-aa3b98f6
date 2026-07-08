/**
 * Regra da SoundOn — cliente com música gravada mas não lançada nas
 * plataformas digitais precisa ser direcionado pra distribuir via
 * SoundOn (https://www.soundon.global/) ANTES de qualquer oferta de
 * impulsionamento.
 */
import { describe, expect, it } from "vitest";
import {
  REGRA_MUSICA_NAO_DISTRIBUIDA_BLOCK,
  buildSharedRules,
  DEFAULT_IDENTITY,
  MIND_BRAND_TEMPLATE,
} from "@/lib/agent-identity.server";

describe("REGRA_MUSICA_NAO_DISTRIBUIDA (SoundOn)", () => {
  const block = REGRA_MUSICA_NAO_DISTRIBUIDA_BLOCK;

  it("menciona SoundOn e link completo", () => {
    expect(block).toMatch(/SoundOn/);
    expect(block).toMatch(/https:\/\/www\.soundon\.global\//);
  });

  it("cobre variações naturais de 'não distribuído'", () => {
    for (const sig of [
      "não lancei ainda",
      "não coloquei nas plataformas",
      "não tá no Spotify ainda",
      "gravei mas não subi",
      "preciso lançar primeiro",
    ]) {
      expect(block.toLowerCase()).toContain(sig.toLowerCase());
    }
  });

  it("proíbe avançar pro funil de impulsionamento antes de distribuir", () => {
    expect(block).toMatch(/PROIBIDO ABSOLUTO/);
    expect(block).toMatch(/ANTES de a música estar distribuída/);
    expect(block).toMatch(/qual opção você prefere/);
  });

  it("proíbe resposta genérica sem citar SoundOn e link", () => {
    expect(block).toMatch(/existem distribuidoras que fazem isso rapidinho/);
    expect(block).toMatch(/sem citar a SoundOn/);
  });

  it("faz parte do system prompt via buildSharedRules", () => {
    const identity = { ...DEFAULT_IDENTITY, ...MIND_BRAND_TEMPLATE };
    const prompt = buildSharedRules(identity, {});
    expect(prompt).toContain("SoundOn");
    expect(prompt).toContain("https://www.soundon.global/");
  });
});
