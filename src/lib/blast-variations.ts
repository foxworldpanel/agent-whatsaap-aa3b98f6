// Sistema de variação inteligente para disparos.
// Detecta horário (timezone Brasil) e monta saudação + linha2 + pergunta.
// Suporta múltiplos idiomas selecionados pelo DDI do telefone do lead.

export type Language = "pt" | "en" | "es";

export type LangTemplates = {
  saudacoes: Record<"manha" | "tarde" | "noite", string[]>;
  linha2: string[];
  perguntas: string[];
};

export const SAUDACOES_DEFAULT: Record<"manha" | "tarde" | "noite", string[]> = {
  manha: [
    "Oi, bom dia {nome}!",
    "Bom dia {nome}, tudo bem?",
    "Oi {nome}, bom dia!",
  ],
  tarde: [
    "Oi, boa tarde {nome}!",
    "Boa tarde {nome}, tudo bem?",
    "Oi {nome}, boa tarde!",
  ],
  noite: [
    "Oi, boa noite {nome}!",
    "Boa noite {nome}, tudo bem?",
    "Oi {nome}, boa noite!",
  ],
};

// LINHA 2 (PT): REGRA FIXA — toda variação começa com "Peguei o seu contato".
// Nunca usar "Vi", "Encontrei", "Achei", "Dei uma olhada" etc. Comunica que o
// contato veio direto da bio do Instagram e gera confiança.
export const LINHA2_DEFAULT: string[] = [
  "Peguei o seu contato no perfil @{instagram}, gostei bastante do conteúdo!",
  "Peguei o seu contato no perfil @{instagram}, adorei seu conteúdo!",
  "Peguei o seu contato no perfil @{instagram}, muito bom o que você posta!",
  "Peguei o seu contato lá no seu perfil @{instagram}, curti bastante o conteúdo!",
  "Peguei o seu contato no seu Instagram @{instagram}, adorei o estilo!",
  "Peguei o seu contato no perfil @{instagram}, achei muito bom o conteúdo!",
  "Peguei o seu contato ali no @{instagram}, gostei bastante do que você posta!",
  "Peguei o seu contato no seu perfil @{instagram}, muito bom seu conteúdo!",
];

export const PERGUNTAS_DEFAULT: string[] = [
  "Posso te mostrar algo que pode acelerar o crescimento das suas redes?",
  "Tenho algo que pode turbinar suas redes, posso te mostrar?",
  "Posso te apresentar algo que pode fazer suas redes crescerem muito mais rápido?",
  "Posso te mostrar uma forma de impulsionar bem o seu perfil?",
];

export const EN_DEFAULT: LangTemplates = {
  saudacoes: {
    manha: [
      "Hi, good morning {nome}!",
      "Hello, good morning {nome}!",
      "Good morning {nome}, how are you?",
    ],
    tarde: [
      "Hi, good afternoon {nome}!",
      "Hello, good afternoon {nome}!",
      "Good afternoon {nome}, how are you?",
    ],
    noite: [
      "Hi, good evening {nome}!",
      "Hello, good evening {nome}!",
      "Good evening {nome}, how are you?",
    ],
  },
  linha2: [
    "I saw your profile @{instagram} on Instagram, loved your content!",
    "I came across your @{instagram} on Instagram, really nice!",
    "Found your @{instagram} on Instagram, I liked it a lot!",
    "Checked out your @{instagram}, great content!",
    "Saw your Instagram @{instagram}, really enjoyed it!",
    "Took a look at your @{instagram}, loved the content!",
  ],
  perguntas: [
    "Can I show you something that could speed up your growth?",
    "Can I show you something that could help grow your following?",
    "I have something that could boost your account, can I show you?",
    "Can I introduce something that could grow your following much faster?",
    "I have something that could really boost your reach, want to see?",
    "Can I show you something that could accelerate your profile's growth?",
  ],
};

export const ES_DEFAULT: LangTemplates = {
  saudacoes: {
    manha: [
      "Hola, buenos días {nome}!",
      "¡Buenos días {nome}!",
      "Buenos días {nome}, ¿cómo estás?",
    ],
    tarde: [
      "Hola, buenas tardes {nome}!",
      "¡Buenas tardes {nome}!",
      "Buenas tardes {nome}, ¿cómo estás?",
    ],
    noite: [
      "Hola, buenas noches {nome}!",
      "¡Buenas noches {nome}!",
      "Buenas noches {nome}, ¿cómo estás?",
    ],
  },
  linha2: [
    "Vi tu perfil @{instagram} en Instagram, ¡me encantó tu contenido!",
    "Encontré tu @{instagram} en Instagram, ¡muy bueno!",
    "Vi tu @{instagram} en Instagram, ¡me gustó bastante!",
    "Eché un vistazo a tu @{instagram}, ¡muy buen contenido!",
    "Vi tu Instagram @{instagram}, ¡me gustó mucho!",
    "Revisé tu @{instagram}, ¡me encantó el contenido!",
  ],
  perguntas: [
    "¿Puedo mostrarte algo que puede acelerar el crecimiento de tus redes?",
    "¿Puedo mostrarte algo que puede ayudarte a crecer en redes?",
    "Tengo algo que puede impulsar tus redes, ¿te lo muestro?",
    "¿Puedo presentarte algo que puede hacer crecer tus redes mucho más rápido?",
    "Tengo algo que puede potenciar mucho tu alcance, ¿te lo muestro?",
    "¿Puedo mostrarte algo que puede acelerar el crecimiento de tu perfil?",
  ],
};

export const PT_DEFAULT: LangTemplates = {
  saudacoes: SAUDACOES_DEFAULT,
  linha2: LINHA2_DEFAULT,
  perguntas: PERGUNTAS_DEFAULT,
};

// Mapa padrão de DDI → idioma. Editável no banco (opening_templates.ddi_language_map).
export const DEFAULT_DDI_LANGUAGE_MAP: Record<string, Language> = {
  "55": "pt",
  "351": "pt",
  "1": "en",
  "34": "es",
  "52": "es",
  "54": "es",
  "57": "es",
  "51": "es",
  "56": "es",
  "593": "es",
  "598": "es",
  "507": "es",
};

export function detectLanguageFromPhone(
  phone: string,
  map: Record<string, Language> = DEFAULT_DDI_LANGUAGE_MAP,
): Language {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return "en";
  // Testa DDIs de 3, 2 e 1 dígitos (mais específico primeiro).
  for (const len of [3, 2, 1]) {
    const prefix = digits.slice(0, len);
    if (map[prefix]) return map[prefix];
  }
  return "en";
}

// Aliases para compatibilidade com UI antiga
export const SAUDACOES = SAUDACOES_DEFAULT;
export const CORPOS_MENSAGEM = LINHA2_DEFAULT;

export type OpeningTemplates = {
  saudacoes: Record<"manha" | "tarde" | "noite", string[]>;
  linha2: string[];
  perguntas: string[];
  // Novos campos multi-idioma (opcionais para retrocompat com UI antiga)
  en?: LangTemplates;
  es?: LangTemplates;
  ddiMap?: Record<string, Language>;
};

export const DEFAULT_TEMPLATES: OpeningTemplates = {
  saudacoes: SAUDACOES_DEFAULT,
  linha2: LINHA2_DEFAULT,
  perguntas: PERGUNTAS_DEFAULT,
  en: EN_DEFAULT,
  es: ES_DEFAULT,
  ddiMap: DEFAULT_DDI_LANGUAGE_MAP,
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
    language?: Language;
  } = {},
): VariationPick {
  const periodo = getPeriodoBrasil(options.now);
  const tpls = options.templates ?? DEFAULT_TEMPLATES;
  const lang: Language = options.language ?? "pt";
  const pack: LangTemplates =
    lang === "en"
      ? (tpls.en ?? EN_DEFAULT)
      : lang === "es"
        ? (tpls.es ?? ES_DEFAULT)
        : { saudacoes: tpls.saudacoes, linha2: tpls.linha2, perguntas: tpls.perguntas };
  const fallback: LangTemplates =
    lang === "en" ? EN_DEFAULT : lang === "es" ? ES_DEFAULT : PT_DEFAULT;
  const saudacoes = pack.saudacoes?.[periodo]?.length
    ? pack.saudacoes[periodo]
    : fallback.saudacoes[periodo];
  const linhas2 = pack.linha2?.length ? pack.linha2 : fallback.linha2;
  const perguntas = pack.perguntas?.length ? pack.perguntas : fallback.perguntas;

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
  ]
    .map((s) => (s ?? "").trim())
    .filter((s) => s.length > 0);
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