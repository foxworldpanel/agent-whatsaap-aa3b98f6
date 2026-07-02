// Sistema de variação inteligente para disparos.
// Detecta horário (timezone Brasil) e monta saudação + linha2 + pergunta.

export const SAUDACOES_DEFAULT: Record<"manha" | "tarde" | "noite", string[]> = {
  manha: [
    "Oi, bom dia {nome}!",
    "Olá, bom dia {nome}!",
    "Bom dia {nome}, tudo bem?",
  ],
  tarde: [
    "Oi, boa tarde {nome}!",
    "Olá, boa tarde {nome}!",
    "Boa tarde {nome}, tudo bem?",
  ],
  noite: [
    "Oi, boa noite {nome}!",
    "Olá, boa noite {nome}!",
    "Boa noite {nome}, tudo bem?",
  ],
};

export const LINHA2_DEFAULT: string[] = [
  "Vi seu perfil @{instagram} no Instagram, curti muito o conteúdo!",
  "Vi seu perfil @{instagram} no Instagram, muito bom!",
  "Encontrei seu @{instagram} no Instagram, curti bastante!",
  "Dei uma olhada no seu @{instagram}, muito bom o conteúdo!",
  "Vi seu Instagram @{instagram} aqui, gostei bastante!",
  "Dei uma olhada no seu @{instagram}, gostei bastante do conteúdo!",
];

export const PERGUNTAS_DEFAULT: string[] = [
  "Posso te mostrar algo que pode acelerar o crescimento das suas redes?",
  "Posso te mostrar algo que pode ajudar a crescer suas redes?",
  "Tenho algo que pode turbinar suas redes, posso te mostrar?",
  "Posso te apresentar algo que pode fazer suas redes crescerem muito mais rápido?",
  "Tenho algo que pode impulsionar muito suas redes, posso te mostrar?",
  "Posso te apresentar algo que pode acelerar o crescimento do seu perfil?",
];

// Aliases para compatibilidade com UI antiga
export const SAUDACOES = SAUDACOES_DEFAULT;
export const CORPOS_MENSAGEM = LINHA2_DEFAULT;

export type OpeningTemplates = {
  saudacoes: Record<"manha" | "tarde" | "noite", string[]>;
  linha2: string[];
  perguntas: string[];
};

export const DEFAULT_TEMPLATES: OpeningTemplates = {
  saudacoes: SAUDACOES_DEFAULT,
  linha2: LINHA2_DEFAULT,
  perguntas: PERGUNTAS_DEFAULT,
};

export function getPeriodoBrasil(now: Date = new Date()): "manha" | "tarde" | "noite" {
  const horaStr = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    hour12: false,
  }).format(now);
  const hora = parseInt(horaStr, 10);
  if (hora >= 5 && hora < 12) return "manha";
  if (hora >= 12 && hora < 18) return "tarde";
  return "noite";
}

export type VariationPick = {
  periodo: "manha" | "tarde" | "noite";
  saudacaoIdx: number;
  linha2Idx: number;
  perguntaIdx: number;
  key: string;
  parts: string[]; // [saudacao, linha2, pergunta]
  text: string; // versão concatenada (compat)
};

function makeKey(periodo: string, s: number, l: number, p: number) {
  return `${periodo}:${s}:${l}:${p}`;
}

function subst(tpl: string, nome: string, instagram: string) {
  return (tpl ?? "")
    .replace(/\{nome\}/gi, nome ?? "")
    .replace(/\{instagram\}/gi, instagram ?? "");
}

export function montarMensagemDisparo(
  nome: string,
  instagram: string,
  options: {
    avoidKey?: string | null;
    avoidSaudacaoIdx?: number | null;
    now?: Date;
    templates?: OpeningTemplates;
  } = {},
): VariationPick {
  const periodo = getPeriodoBrasil(options.now);
  const tpls = options.templates ?? DEFAULT_TEMPLATES;
  const saudacoes =
    (tpls.saudacoes?.[periodo]?.length ? tpls.saudacoes[periodo] : DEFAULT_TEMPLATES.saudacoes[periodo]);
  const linhas2 = tpls.linha2?.length ? tpls.linha2 : DEFAULT_TEMPLATES.linha2;
  const perguntas = tpls.perguntas?.length ? tpls.perguntas : DEFAULT_TEMPLATES.perguntas;

  let sIdx = 0;
  let lIdx = 0;
  let pIdx = 0;
  let key = "";
  for (let i = 0; i < 10; i++) {
    sIdx = Math.floor(Math.random() * saudacoes.length);
    lIdx = Math.floor(Math.random() * linhas2.length);
    pIdx = Math.floor(Math.random() * perguntas.length);
    key = makeKey(periodo, sIdx, lIdx, pIdx);
    const sameCombo = key === options.avoidKey;
    const sameSaud =
      options.avoidSaudacaoIdx != null && sIdx === options.avoidSaudacaoIdx && saudacoes.length > 1;
    if (!sameCombo && !sameSaud) break;
  }

  const parts = [
    subst(saudacoes[sIdx], nome, instagram),
    subst(linhas2[lIdx], nome, instagram),
    subst(perguntas[pIdx], nome, instagram),
  ];
  return {
    periodo,
    saudacaoIdx: sIdx,
    linha2Idx: lIdx,
    perguntaIdx: pIdx,
    key,
    parts,
    text: parts.join("\n\n"),
  };
}

export function listarExemplos(): Array<{ periodo: string; exemplos: string[] }> {
  return (["manha", "tarde", "noite"] as const).map((p) => ({
    periodo: p,
    exemplos: SAUDACOES_DEFAULT[p].flatMap((s) =>
      LINHA2_DEFAULT.map((c) => `${s}\n\n${c.replace("{instagram}", "perfil_exemplo")}`),
    ),
  }));
}

export function saudacaoIdxFromKey(key: string | null | undefined): number | null {
  if (!key) return null;
  const parts = key.split(":");
  if (parts.length < 2) return null;
  const n = parseInt(parts[1], 10);
  return Number.isFinite(n) ? n : null;
}