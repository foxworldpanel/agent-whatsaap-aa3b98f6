// ETAPA 2 — Knowledge Base sob demanda.
//
// Antes: uazapi-webhook enviava sempre as 50 KBs mais recentes pra Claude,
// independente de haver relação com a pergunta atual — inflava 5k-25k
// chars por chamada sem retorno em qualidade.
//
// Agora: filtra por relevância keyword-based (mesmo padrão dos módulos
// por rede). Se nada bate, retorna [] e o prompt não injeta bloco KB.
//
// Heurística deliberadamente simples (não é RAG/embeddings): tokens da
// mensagem do cliente + regex de tópicos (spotify/preço/painel/etc).
// Testável, determinístico, sem custo de API.

export interface KnowledgeRow {
  context?: string | null;
  content: string;
}

// Tópicos alinhados à taxonomia do sistema.
const TOPIC_RX: Array<{ rx: RegExp; tag: string }> = [
  { rx: /spotify|playlist|ouvintes?|saves?|m[uú]sica|artista|soundon|streaming|plays/i, tag: "spotify" },
  { rx: /youtube|yt\b|inscritos?|views?|monetiza|shorts?|canal/i, tag: "youtube" },
  { rx: /instagram|insta|ig\b|reels?|stories?|seguidor/i, tag: "instagram" },
  { rx: /tiktok|tt\b/i, tag: "tiktok" },
  { rx: /kwai/i, tag: "kwai" },
  { rx: /facebook|fb\b|face\b/i, tag: "facebook" },
  { rx: /google|seo|maps|gmb|avalia[çc][aã]o|estrelas/i, tag: "google" },
  { rx: /pre[çc]o|valor|quanto custa|custa|tabela|or[çc]amento|cota[çc][aã]o|\br\$/i, tag: "preco" },
  { rx: /desconto|barato|caro|promo/i, tag: "desconto" },
  { rx: /pix|pagar|pagamento|boleto|cart[aã]o|cripto|usdt|d[oó]lar|exterior|estrangeir/i, tag: "pagamento" },
  { rx: /teste|gr[aá]tis|free|amostra/i, tag: "teste_gratis" },
  { rx: /problema|n[aã]o funcionou|n[aã]o recebi|atras|suporte|ticket|reclama|refil|erro/i, tag: "suporte" },
  { rx: /painel|cadastr|conta|login|saldo|dep[oó]sito|adicionar fundos/i, tag: "painel" },
  { rx: /n[aã]o quero|depois|talvez|caro demais|pensar|objec/i, tag: "objecao" },
  { rx: /comprei|fechei|paguei|comprovante|pedido feito/i, tag: "pos_venda" },
  { rx: /sumiu|voltei|faz tempo|de novo/i, tag: "reativacao" },
  { rx: /confi[aá]|seguro|golpe|verdade|funciona mesmo|garantia/i, tag: "confianca" },
];

// Stopwords + palavras curtas ignoradas na tokenização.
const STOPWORDS = new Set([
  "para","pelo","pela","como","onde","quem","isso","essa","este","esse","aqui",
  "voce","você","vocês","tudo","tudo","nada","muito","mais","menos","também",
  "tambem","sobre","entre","assim","porque","porquê","depois","antes","estou",
  "está","esta","estão","serão","vamos","vai","preciso","quero","tenho","fazer",
  "posso","pode","poder","meu","minha","seus","suas","dele","dela","deles","dela",
  "aquele","aquela","hoje","ontem","amanha","amanhã","noite","tarde","manhã","manha",
  "coisa","gente","obrigado","obrigada","valeu","legal","show","fala","olha","bora",
  "outra","outro","outros","outras","desde","enquanto","porém","porem","então","entao",
  "algum","alguma","alguns","algumas","nenhum","qualquer","talvez",
]);

function normalize(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ");
}

function tokenize(s: string): Set<string> {
  const out = new Set<string>();
  for (const raw of normalize(s).split(/\s+/)) {
    if (raw.length < 4) continue;
    if (STOPWORDS.has(raw)) continue;
    out.add(raw);
  }
  return out;
}

function topicsOf(s: string): Set<string> {
  const out = new Set<string>();
  for (const t of TOPIC_RX) if (t.rx.test(s)) out.add(t.tag);
  return out;
}

export interface SelectRelevantKbOptions {
  // Máximo de exemplos incluídos mesmo quando muitos batem. Default 10.
  max?: number;
  // Score mínimo pra incluir. Default 1.
  minScore?: number;
}

export interface KbSelectionResult {
  selected: KnowledgeRow[];
  totalCandidates: number;
  reason: "no-signal" | "no-match" | "filtered" | "empty-input";
  topicsHit: string[];
}

// Mensagens muito curtas / saudação: não vale filtrar KB.
function isLowSignal(msg: string): boolean {
  const norm = normalize(msg).trim();
  if (!norm) return true;
  if (norm.length < 6) return true;
  // Saudação/confirmação pura sem substância.
  return /^(oi+|ola|opa|eae|eai|blz|ok|okay|sim|nao|não|show|valeu|obrigad[oa]|tudo bem|bom dia|boa tarde|boa noite)\b/.test(norm);
}

export function selectRelevantKnowledge(
  rows: KnowledgeRow[],
  latestClientMessage: string,
  opts: SelectRelevantKbOptions = {},
): KbSelectionResult {
  const max = opts.max ?? 10;
  const minScore = opts.minScore ?? 1;
  const clean = (rows ?? []).filter((r) => (r?.content ?? "").trim().length > 0);
  if (clean.length === 0) {
    return { selected: [], totalCandidates: 0, reason: "empty-input", topicsHit: [] };
  }
  if (!latestClientMessage || isLowSignal(latestClientMessage)) {
    return { selected: [], totalCandidates: clean.length, reason: "no-signal", topicsHit: [] };
  }

  const msgTokens = tokenize(latestClientMessage);
  const msgTopics = topicsOf(latestClientMessage);

  type Scored = { row: KnowledgeRow; score: number };
  const scored: Scored[] = clean.map((r) => {
    const hay = `${r.context ?? ""}\n${r.content}`;
    const rowTokens = tokenize(hay);
    let score = 0;
    // Token overlap.
    for (const t of msgTokens) if (rowTokens.has(t)) score++;
    // Topic boost: peso 2 por tópico compartilhado (regex-based).
    const rowTopics = topicsOf(hay);
    for (const t of msgTopics) if (rowTopics.has(t)) score += 2;
    return { row: r, score };
  });

  const filtered = scored.filter((s) => s.score >= minScore);
  if (filtered.length === 0) {
    return { selected: [], totalCandidates: clean.length, reason: "no-match", topicsHit: [...msgTopics] };
  }
  filtered.sort((a, b) => b.score - a.score);
  return {
    selected: filtered.slice(0, max).map((s) => s.row),
    totalCandidates: clean.length,
    reason: "filtered",
    topicsHit: [...msgTopics],
  };
}