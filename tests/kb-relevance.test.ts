import { describe, it, expect } from "vitest";
import { selectRelevantKnowledge, type KnowledgeRow } from "@/lib/kb-relevance";

const KB: KnowledgeRow[] = [
  { context: "spotify preço", content: "Cliente pergunta quanto custa 1000 plays no Spotify. Júlia: 'Sai R$15, quer fechar?'" },
  { context: "instagram", content: "Cliente quer seguidores no Instagram. Explica pacote 500 seguidores." },
  { context: "painel cadastro", content: "Como cadastrar no painel Mind SMM: entra em mindsmmpanel.com, cria conta, deposita via PIX." },
  { context: "objeção confiança", content: "'É confiável mesmo?' → Júlia responde sobre entrega gradual, ouvintes reais, sem violar regras." },
  { context: "youtube inscritos", content: "Cliente quer inscritos no YouTube. Terminologia: YT usa inscritos, não seguidores." },
  { context: "teste grátis", content: "Cliente pede amostra. Regra: só oferecer se pediu explícito ou desconfiou." },
];

describe("ETAPA 2 — KB sob demanda (selectRelevantKnowledge)", () => {
  it("pergunta sobre Spotify → seleciona só KBs de spotify/preço", () => {
    const r = selectRelevantKnowledge(KB, "quanto custa 1000 plays no spotify?");
    expect(r.reason).toBe("filtered");
    expect(r.selected.length).toBeGreaterThan(0);
    expect(r.selected[0].context).toContain("spotify");
    // KB de youtube/instagram NÃO deve entrar como top.
    expect(r.selected.every((s) => !/instagram|youtube/i.test(s.context ?? ""))).toBe(true);
  });

  it("pergunta sobre painel/cadastro → traz KB de painel", () => {
    const r = selectRelevantKnowledge(KB, "como faço pra cadastrar no painel?");
    expect(r.reason).toBe("filtered");
    expect(r.selected.some((s) => (s.context ?? "").includes("painel"))).toBe(true);
  });

  it("pergunta sobre confiança → traz KB de objeção", () => {
    const r = selectRelevantKnowledge(KB, "isso é confiável mesmo? não é golpe?");
    expect(r.reason).toBe("filtered");
    expect(r.selected.some((s) => (s.context ?? "").includes("confiança"))).toBe(true);
  });

  it("pergunta sobre YouTube → traz KB de YT", () => {
    const r = selectRelevantKnowledge(KB, "quero inscritos no meu canal do youtube");
    expect(r.reason).toBe("filtered");
    expect(r.selected.some((s) => (s.context ?? "").includes("youtube"))).toBe(true);
  });

  it("pergunta sobre teste grátis → traz KB de teste", () => {
    const r = selectRelevantKnowledge(KB, "tem teste grátis pra eu experimentar?");
    expect(r.reason).toBe("filtered");
    expect(r.selected.some((s) => (s.context ?? "").includes("teste"))).toBe(true);
  });

  it("mensagem sem relação com KB → retorna vazio (no-match)", () => {
    const r = selectRelevantKnowledge(KB, "você viu o jogo do corinthians ontem?");
    expect(r.reason).toBe("no-match");
    expect(r.selected).toEqual([]);
  });

  it("saudação curta → no-signal, sem KB", () => {
    const r = selectRelevantKnowledge(KB, "oi");
    expect(r.reason).toBe("no-signal");
    expect(r.selected).toEqual([]);
  });

  it("input vazio → no-signal", () => {
    const r = selectRelevantKnowledge(KB, "");
    expect(r.reason).toBe("no-signal");
  });

  it("pool vazio → empty-input", () => {
    const r = selectRelevantKnowledge([], "quanto custa spotify?");
    expect(r.reason).toBe("empty-input");
  });

  it("respeita opts.max (cap superior)", () => {
    const bigKb: KnowledgeRow[] = Array.from({ length: 30 }, (_, i) => ({
      context: `spotify caso ${i}`,
      content: `pergunta sobre spotify plays preço R$ caso ${i}`,
    }));
    const r = selectRelevantKnowledge(bigKb, "quanto custa plays spotify", { max: 5 });
    expect(r.selected.length).toBe(5);
  });
});