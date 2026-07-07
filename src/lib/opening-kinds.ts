// Catálogo de "tipos de abertura" (roteiros de mensagem inicial) por campanha
// de disparo. Extensível: para adicionar um novo tipo (ex.: Smoke Music,
// campanha de indicação), basta acrescentar uma nova entrada aqui — a UI e o
// dispatcher passam a suportar automaticamente.

export type OpeningKind = {
  key: string;
  label: string;
  emoji: string;
  description: string;
  // Se true, usa o sistema de variações (saudação + linha2 + pergunta) com
  // manhã/tarde/noite e idiomas do lead. Se false, usa `template` como está.
  useVariations: boolean;
  // Se true, permite reenvio para contatos que já foram abordados antes em
  // outras campanhas (bypass da trava de cross-list / "já respondeu").
  // Contatos bloqueados/convertidos continuam bloqueados.
  allowResend: boolean;
  // Template usado quando useVariations = false. Cada bloco separado por
  // linha em branco vira uma bolha independente.
  template: string;
};

export const DEFAULT_OPENING_KIND = "instagram_frio";

export const OPENING_KINDS: OpeningKind[] = [
  {
    key: "instagram_frio",
    label: "Instagram — Abordagem Fria",
    emoji: "📷",
    description:
      'Saudação + "Peguei o seu contato no perfil @{instagram}..." + pergunta de abertura. Usa variações de manhã/tarde/noite e idiomas do lead. Não reenvia para contatos já abordados.',
    useVariations: true,
    allowResend: false,
    template: "",
  },
  {
    key: "meta_ads_reativacao",
    label: "Meta Ads — Reativação",
    emoji: "🎯",
    description:
      "Reabordagem de leads que já chegaram via anúncio. Permite reenvio para quem já foi contactado antes.",
    useVariations: false,
    allowResend: true,
    template:
      "Oi, tudo bem? Aqui é a Júlia da Mind 😊\n\nFaz um tempo que você chegou até a gente através do nosso anúncio, e eu queria saber se ainda tem interesse em impulsionar suas redes.\n\nA gente tem novidades boas, inclusive um serviço novo de playlist no Spotify que tá bombando. Bora dar uma conversada de novo?",
  },
];

export function getOpeningKind(key: string | null | undefined): OpeningKind {
  return OPENING_KINDS.find((k) => k.key === key) ?? OPENING_KINDS[0];
}

// Divide o template em bolhas (uma por parágrafo).
export function templateParts(kind: OpeningKind): string[] {
  return (kind.template ?? "")
    .split(/\n\s*\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}