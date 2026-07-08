// Catálogo de "tipos de abertura" (roteiros de mensagem inicial) por campanha
// de disparo. Extensível: para adicionar um novo tipo (ex.: Smoke Music,
// campanha de indicação), basta acrescentar uma nova entrada aqui — a UI e o
// dispatcher passam a suportar automaticamente.

import type { LangTemplates } from "@/lib/blast-variations";

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
  // Pack de variações próprio (PT) usado quando useVariations = true e o
  // kind NÃO deve reaproveitar o opening_templates editável do usuário
  // (que é dedicado ao Instagram frio). Se ausente, cai no template do
  // usuário. Fornecido para reativação Meta Ads, etc.
  variations?: LangTemplates;
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
      "Reabordagem de leads que já chegaram via anúncio. Usa variações (saudação por período + linha 2 + pergunta final) para evitar padrão repetitivo. Permite reenvio para quem já foi contactado antes.",
    useVariations: true,
    allowResend: true,
    template: "",
    variations: {
      saudacoes: {
        manha: ["Oi, bom dia!", "Olá, bom dia!", "Bom dia, tudo bem?"],
        tarde: ["Oi, boa tarde!", "Olá, boa tarde!", "Boa tarde, tudo bem?"],
        noite: ["Oi, boa noite!", "Olá, boa noite!", "Boa noite, tudo bem?"],
      },
      linha2: [
        "Aqui é a Júlia da Mind! Faz um tempo que você chegou até a gente através do nosso anúncio.",
        "Aqui é a Júlia da Mind! Você chegou até a gente há um tempo através do nosso anúncio.",
        "Sou a Júlia, da Mind! Você entrou em contato com a gente faz um tempo, através do nosso anúncio.",
      ],
      perguntas: [
        "Ainda tem interesse em impulsionar suas redes? A gente tem novidades boas, inclusive pra Instagram, YouTube, TikTok e playlist no Spotify. Bora conversar de novo?",
        "Queria saber se ainda tem interesse em crescer suas redes! Temos novidades em Instagram, YouTube, TikTok e Spotify. Topa dar uma conversada?",
        "Continua com interesse em impulsionar seu perfil? Tem coisa nova rolando pra Instagram, YouTube, TikTok e Spotify. Vamos conversar?",
      ],
    },
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