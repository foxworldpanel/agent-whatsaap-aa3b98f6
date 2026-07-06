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
    "Oi, bom dia!",
    "Bom dia, tudo bem?",
    "Oi, bom dia!",
  ],
  tarde: [
    "Oi, boa tarde!",
    "Boa tarde, tudo bem?",
    "Oi, boa tarde!",
  ],
  noite: [
    "Oi, boa noite!",
    "Boa noite, tudo bem?",
    "Oi, boa noite!",
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
      "Hi, good morning!",
      "Hello, good morning!",
      "Good morning, how are you?",
    ],
    tarde: [
      "Hi, good afternoon!",
      "Hello, good afternoon!",
      "Good afternoon, how are you?",
    ],
    noite: [
      "Hi, good evening!",
      "Hello, good evening!",
      "Good evening, how are you?",
    ],
  },
  linha2: [
    "I got your contact from your profile @{instagram}, loved your content!",
    "I got your contact from your @{instagram} profile, really liked what you post!",
    "I got your contact off your Instagram @{instagram}, great content by the way!",
    "I got your contact right there on your profile @{instagram}, loved the style!",
    "I got your contact from @{instagram}, really enjoyed your content!",
    "I got your contact from your Instagram profile @{instagram}, awesome content!",
    "I got your contact straight from @{instagram}, liked it a lot!",
    "I got your contact on your @{instagram} profile, really solid content!",
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
      "¡Hola, buenos días!",
      "¡Buenos días!",
      "Buenos días, ¿cómo estás?",
    ],
    tarde: [
      "¡Hola, buenas tardes!",
      "¡Buenas tardes!",
      "Buenas tardes, ¿cómo estás?",
    ],
    noite: [
      "¡Hola, buenas noches!",
      "¡Buenas noches!",
      "Buenas noches, ¿cómo estás?",
    ],
  },
  linha2: [
    "Conseguí tu contacto en tu perfil @{instagram}, ¡me encantó tu contenido!",
    "Conseguí tu contacto en tu perfil @{instagram}, ¡muy bueno lo que publicas!",
    "Conseguí tu contacto ahí en tu Instagram @{instagram}, ¡me gustó bastante!",
    "Conseguí tu contacto en tu perfil @{instagram}, ¡me encantó el estilo!",
    "Conseguí tu contacto directo de tu @{instagram}, ¡muy buen contenido!",
    "Conseguí tu contacto en tu perfil de Instagram @{instagram}, ¡excelente contenido!",
    "Conseguí tu contacto ahí en @{instagram}, ¡me gustó mucho!",
    "Conseguí tu contacto en tu perfil @{instagram}, ¡muy sólido tu contenido!",
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

function subst(tpl: string, _nome: string, instagram: string) {
  // REGRA FIXA da abertura de DISPARO: nunca usar o campo "nome" do contato,
  // independente do que estiver preenchido (nome real, @usuário do Instagram,
  // nome de dupla/marca). O campo `nome` é só para exibição interna (Contatos
  // e Conversas). Se algum template (default ou editado no banco) contiver
  // {nome}, ele é removido silenciosamente e espaços/pontuação órfãos são
  // limpos, para nunca sair uma abertura tipo "Oi , tudo bem?".
  return (tpl ?? "")
    .replace(/\{nome\}/gi, "")
    .replace(/\{instagram\}/gi, instagram ?? "")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
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