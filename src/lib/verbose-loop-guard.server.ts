// Trava de custo contra "loop de reexplicação sem avanço" com cliente muito
// leigo. Motivação: em produção observamos casos onde um cliente idoso/leigo
// pede a mesma explicação básica várias vezes, sem nunca chegar a fazer o
// pedido — e cada turno gasta uma chamada Anthropic real ($$$). Um lote de
// poucas conversas assim já consumiu $7 sozinho.
//
// Regras de negócio (mantidas alinhadas ao spec do produto):
// - Só dispara com 2+ sinais fortes juntos. Nunca só por conversa longa.
// - Última mensagem da Júlia = "farewell caloroso e objetivo" + para de
//   responder + marca a conversa com review_reason = VERBOSE_LOOP_REVIEW_REASON.
// - Se o cliente voltar depois com uma AÇÃO CONCRETA (link de música,
//   confirmação de compra, pergunta objetiva de preço/valor, ID de pedido),
//   `looksLikeConcreteAction()` retorna true e o webhook destrava a conversa
//   silenciosamente (sem novo aviso).

export const VERBOSE_LOOP_REVIEW_REASON =
  "Revisar — Suporte humanizado necessário (loop de reexplicação sem avanço)";

export const VERBOSE_LOOP_FAREWELL =
  "Fica tranquilo que o processo é simples, e o pessoal do nosso suporte pode te ajudar direitinho quando quiser começar. Qualquer coisa é só voltar aqui que a equipe te atende! 😊";

export type LoopMsg = { sender: "agente" | "cliente"; body: string | null };

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

// -------- Sinais de detecção --------

// Sinal 1: cliente se declara leigo / de outra geração / com dificuldade.
const LAYMAN_PATTERNS: RegExp[] = [
  /\bsou\s+(meio\s+|bem\s+|um\s+pouco\s+)?leig[ao]\b/,
  /\bn[ao]o\s+entendo\s+(muito\s+|bem\s+|nada\s+)?(de\s+)?(tecnologia|internet|celular|isso)\b/,
  /\bn[ao]o\s+sou\s+(muito\s+)?bom\s+(nisso|com\s+isso|com\s+tecnologia)\b/,
  /\bn[ao]o\s+manjo\s+(muito\s+)?(disso|de\s+tecnologia)\b/,
  /\bsou\s+(de\s+)?(uma\s+)?(outra\s+|antiga\s+)?(gera[cç][ao]o|epoca|era|tempo)\b/,
  /\btv\s+preto\s+e\s+branco\b/,
  /\bidad(?:e|inh[oa])\b.*\b(n[ao]o|dif[ií]cil|complicad)/,
  /\bmais\s+devagar\b/,
  /\bpode\s+(me\s+)?explicar\s+de\s+novo\b/,
  /\bcomo\s+assim\?/,
];

export function hasLaymanSelfDeclaration(history: LoopMsg[], latestClientBody: string): boolean {
  const combined = [latestClientBody, ...history.filter((m) => m.sender === "cliente").map((m) => m.body ?? "")].join("\n");
  const norm = normalize(combined);
  return LAYMAN_PATTERNS.some((rx) => rx.test(norm));
}

// Sinal 2: a MESMA explicação básica repetida 2+ vezes pela Júlia.
// Buckets grosseiros por tópico. Se algum bucket foi tocado por >=2 mensagens
// distintas da Júlia SEM que o cliente tenha avançado, conta como sinal.
const EXPLANATION_BUCKETS: Array<{ name: string; rx: RegExp }> = [
  { name: "como_funciona", rx: /\b(como\s+funciona|funciona\s+assim|é\s+bem\s+simples|é\s+só|basicamente)\b/i },
  { name: "onde_pagar", rx: /\b(pix|pagamento|pagar|painel|criar\s+(sua\s+)?conta|colocar\s+saldo|saldo)\b/i },
  { name: "qual_plataforma", rx: /\b(spotify|youtube|instagram|tiktok|plataforma|rede\s+social)\b/i },
  { name: "catalogo_preco", rx: /\b(pacote|m[ií]nimo|menor\s+quantidade|a\s+partir\s+de|sai\s+r\$)/i },
];

export function hasRepeatedExplanations(history: LoopMsg[]): boolean {
  const agentMsgs = history.filter((m) => m.sender === "agente" && (m.body ?? "").trim());
  if (agentMsgs.length < 2) return false;
  for (const bucket of EXPLANATION_BUCKETS) {
    let hits = 0;
    for (const m of agentMsgs) {
      if (bucket.rx.test(m.body ?? "")) hits += 1;
      if (hits >= 3) return true; // 3+ mensagens da Júlia no mesmo bucket
    }
  }
  return false;
}

// Ação concreta do cliente: link/URL de música/vídeo/perfil, confirmação de
// compra, ID numérico de pedido, ou pergunta objetiva de preço com valor.
// Usada em duas situações:
//   1) para NEGAR o sinal "longo sem avanço" (se ação concreta apareceu no
//      histórico, a conversa progrediu — não é loop);
//   2) para REATIVAR a conversa após a trava (cliente voltou com intenção).
const CONCRETE_ACTION_PATTERNS: RegExp[] = [
  /https?:\/\//i,
  /\b(spotify|open\.spotify|youtu\.be|youtube\.com|instagram\.com|tiktok\.com|kwai\.com)\b/i,
  /\b(quero\s+comprar|quero\s+fechar|vou\s+pagar|pode\s+mandar\s+o\s+pix|manda\s+o\s+pix|bora\s+fechar|fechou)\b/i,
  /\bid\s*(do\s+)?pedido\b/i,
  /\b\d{5,}\b/, // provável ID de pedido
  /\bquanto\s+(custa|sai|fica)\s+(pra|para)\s+\d+/i,
  /\br\$\s*\d+/i,
];

export function looksLikeConcreteAction(text: string | null | undefined): boolean {
  if (!text) return false;
  return CONCRETE_ACTION_PATTERNS.some((rx) => rx.test(text));
}

// Sinal 3: conversa longa SEM ação concreta em nenhum turno do cliente.
// Threshold conservador (15+ mensagens totais) alinhado ao spec.
export function isLongWithoutProgress(history: LoopMsg[]): boolean {
  if ((history?.length ?? 0) < 15) return false;
  const clientMsgs = history.filter((m) => m.sender === "cliente");
  const anyConcrete = clientMsgs.some((m) => looksLikeConcreteAction(m.body ?? ""));
  return !anyConcrete;
}

// Sinal 4: cliente divaga (mensagens longas sem pergunta objetiva nova).
// 2+ mensagens do cliente com > 200 chars e sem "?" contam.
export function clientDivagatesWithoutQuestion(history: LoopMsg[]): boolean {
  const long = history.filter(
    (m) => m.sender === "cliente" && (m.body ?? "").length > 200 && !/\?/.test(m.body ?? ""),
  );
  return long.length >= 2;
}

export type VerboseLoopSignal =
  | "layman_self_declaration"
  | "repeated_explanations"
  | "long_without_progress"
  | "client_divagates";

export type VerboseLoopDetection = {
  triggered: boolean;
  signals: VerboseLoopSignal[];
};

// Regra final: 2+ sinais juntos disparam a trava.
// Importante: se o histórico contém AÇÃO CONCRETA em qualquer momento (link
// mandado, compra confirmada, ID de pedido), a conversa progrediu — nunca
// dispara, mesmo com sinais linguísticos de leigo.
export function detectVerboseLoop(params: {
  history: LoopMsg[];
  latestClientBody: string;
}): VerboseLoopDetection {
  const { history, latestClientBody } = params;
  const anyConcreteInHistory = history.some(
    (m) => m.sender === "cliente" && looksLikeConcreteAction(m.body ?? ""),
  );
  if (anyConcreteInHistory || looksLikeConcreteAction(latestClientBody)) {
    return { triggered: false, signals: [] };
  }

  const signals: VerboseLoopSignal[] = [];
  if (hasLaymanSelfDeclaration(history, latestClientBody)) signals.push("layman_self_declaration");
  if (hasRepeatedExplanations(history)) signals.push("repeated_explanations");
  if (isLongWithoutProgress(history)) signals.push("long_without_progress");
  if (clientDivagatesWithoutQuestion(history)) signals.push("client_divagates");

  return { triggered: signals.length >= 2, signals };
}