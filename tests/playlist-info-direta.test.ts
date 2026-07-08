import { describe, it, expect } from "vitest";
import {
  REGRA_AMBIGUIDADE_DUPLA_ESCOLHA_BLOCK,
  buildRegraPlaylistsInfoDiretaBlock,
  buildSharedRules,
  DEFAULT_IDENTITY,
} from "@/lib/agent-identity.server";

// ANTI-REGRESSÃO 08/07 — Falha 2:
// Cliente: "Sim" (resposta ambígua a "quer saber as playlists ou já fecha?")
// Júlia: "Abre um ticket no Suporte pra saber as playlists 😊"  ← INVENTOU política.
// Correções: (1) regra de ambiguidade em pergunta com duas opções;
// (2) lista real de playlists injetada no prompt com trava contra ticket.

describe("REGRA — resposta ambígua a pergunta com duas opções", () => {
  it("bloco define comportamento pra 'Sim' quando há 2 opções distintas", () => {
    expect(REGRA_AMBIGUIDADE_DUPLA_ESCOLHA_BLOCK).toMatch(/duas opções distintas/i);
    expect(REGRA_AMBIGUIDADE_DUPLA_ESCOLHA_BLOCK).toMatch(/PROIBIDO assumir/i);
    expect(REGRA_AMBIGUIDADE_DUPLA_ESCOLHA_BLOCK).toMatch(/MAIS SEGURA\/INFORMATIVA/);
    expect(REGRA_AMBIGUIDADE_DUPLA_ESCOLHA_BLOCK).toMatch(/ticket NUNCA é resposta a ambiguidade/);
  });
});

describe("REGRA — lista de playlists é informação que a Júlia já possui", () => {
  const PL1 = "https://open.spotify.com/playlist/AAA";
  const PL2 = "https://open.spotify.com/playlist/BBB";

  it("com catálogo cadastrado: injeta os links reais e proíbe redirecionar pra ticket", () => {
    const block = buildRegraPlaylistsInfoDiretaBlock({
      ecletica: [PL1],
      eletronica: [PL2],
    });
    expect(block).toContain(PL1);
    expect(block).toContain(PL2);
    expect(block).toMatch(/PROIBIDO ABSOLUTO/);
    expect(block).toMatch(/Abre um ticket no Suporte/);
    expect(block).toMatch(/nada disso/i);
  });

  it("sem catálogo: NÃO inventa ticket e admite honestamente que vai confirmar", () => {
    const block = buildRegraPlaylistsInfoDiretaBlock(null);
    expect(block).toMatch(/lista ainda não cadastrada/i);
    expect(block).toMatch(/NUNCA invente ticket como caminho/i);
  });

  it("buildSharedRules injeta ambos os blocos no system prompt", () => {
    const out = buildSharedRules(DEFAULT_IDENTITY, {
      playlistCatalog: { ecletica: [PL1, PL2], eletronica: [] },
    });
    expect(out).toContain(PL1);
    expect(out).toContain(PL2);
    expect(out).toMatch(/RESPOSTA AMBÍGUA A PERGUNTA COM DUAS OPÇÕES/);
    expect(out).toMatch(/LISTA DE PLAYLISTS É INFORMAÇÃO QUE VOCÊ JÁ POSSUI/);
  });

  it("não sugere 'abrir ticket' em nenhum lugar do prompt para pedir a lista de playlists", () => {
    const out = buildSharedRules(DEFAULT_IDENTITY, {
      playlistCatalog: { ecletica: [PL1], eletronica: [PL2] },
    });
    // A frase inteira "abre um ticket ... playlists" só pode aparecer como
    // EXEMPLO PROIBIDO — nunca como orientação. Garante que o texto entre
    // essa frase e a próxima quebra de linha esteja em bloco de proibição.
    const proibidoRe = /abre um ticket[^\n]*playlist/i;
    const matches = out.match(new RegExp(proibidoRe, "gi")) ?? [];
    for (const m of matches) {
      const idx = out.indexOf(m);
      const contexto = out.slice(Math.max(0, idx - 200), idx);
      expect(
        /PROIBIDO|nada disso|ERRADO|não\s+é/i.test(contexto),
        `FALHOU: "${m}" aparece FORA de bloco proibitivo`,
      ).toBe(true);
    }
  });
});