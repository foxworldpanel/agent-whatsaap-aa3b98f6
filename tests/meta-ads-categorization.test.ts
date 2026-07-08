import { describe, it, expect } from "vitest";
import { matchTriggerRule, type TriggerRule } from "@/lib/meta-ads-categorization.server";

const RULES: TriggerRule[] = [
  { pattern: "divulgar minha música", category_slug: "meta_ads_spotify", category_nome: "Meta Ads - Spotify", category_cor: "green", category_icone: "🎵", priority: 200, active: true },
  { pattern: "spotify", category_slug: "meta_ads_spotify", category_nome: "Meta Ads - Spotify", category_cor: "green", category_icone: "🎵", priority: 190, active: true },
  { pattern: "impulsionar meus vídeos", category_slug: "meta_ads_youtube", category_nome: "Meta Ads - YouTube", category_cor: "red", category_icone: "📺", priority: 200, active: true },
  { pattern: "youtube", category_slug: "meta_ads_youtube", category_nome: "Meta Ads - YouTube", category_cor: "red", category_icone: "📺", priority: 190, active: true },
];

describe("matchTriggerRule — auto-categorização Meta Ads", () => {
  it("gatilho Spotify pelo texto exato do anúncio", () => {
    const m = matchTriggerRule("Olá! Tenho interesse em divulgar minha música.", RULES);
    expect(m?.category_slug).toBe("meta_ads_spotify");
  });

  it("gatilho YouTube pelo texto exato do anúncio", () => {
    const m = matchTriggerRule("Gostaria de impulsionar meus vídeos.", RULES);
    expect(m?.category_slug).toBe("meta_ads_youtube");
  });

  it("menção genérica ao Spotify também classifica como Spotify", () => {
    expect(matchTriggerRule("quero saber do Spotify", RULES)?.category_slug).toBe("meta_ads_spotify");
  });

  it("menção genérica ao YouTube também classifica como YouTube", () => {
    expect(matchTriggerRule("é pra YouTube meu canal", RULES)?.category_slug).toBe("meta_ads_youtube");
  });

  it("mensagem que não bate com nenhuma regra retorna null (fallback Meta Ads)", () => {
    expect(matchTriggerRule("Bom dia, quero saber sobre serviços", RULES)).toBeNull();
    expect(matchTriggerRule("", RULES)).toBeNull();
    expect(matchTriggerRule(null, RULES)).toBeNull();
  });

  it("respeita priority: 'divulgar minha música' (200) bate antes de 'spotify' (190)", () => {
    const m = matchTriggerRule("divulgar minha música no spotify", RULES);
    // ambas casam, mas priority 200 vence
    expect(m?.pattern).toBe("divulgar minha música");
  });

  it("regras inativas são ignoradas", () => {
    const rules = RULES.map((r) => ({ ...r, active: false }));
    expect(matchTriggerRule("divulgar minha música", rules)).toBeNull();
  });
});
