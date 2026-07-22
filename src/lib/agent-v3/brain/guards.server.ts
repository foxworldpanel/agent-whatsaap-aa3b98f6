// src/lib/agent-v3/guards.server.ts

/**
 * GUARD DETERMINÍSTICO CONTRA VAZAMENTO DE PROMPT INTERNO.
 * Remove metadados, marcadores de sistema e rótulos internos que o LLM possa ecoar.
 */
export function sanitizeSystemLeaks(text: string): string {
  if (!text) return "";
  
  // 1. Remove marcadores de metadados da V3: [TEMP:...] [INTENT:...] [STAGE:...]
  let out = text.replace(/\[TEMP:.*?\]|\[INTENT:.*?\]|\[STAGE:.*?\]/g, "");

  // 2. Marcadores clássicos da V1 que podem vazar via transferência de blocos
  const patterns = [
    /⛔/,
    /VETO DE PRIORIDADE/i,
    /PRIORIDADE M[ÁA]XIMA/i,
    /MODO REENGAJAMENTO/i,
    /MODO [ÁA]UDIO/i,
    /MODO SUPORTE/i,
    /OBRIGA[ÇC][ÕO]ES desta resposta/i,
    /FORMATO OBRIGAT[ÓO]RIO/i,
    /REFINAMENTOS DE TOM/i,
    /REGRA ABSOLUTA DE CONTEXTO/i,
    /SOBRESCREVE/,
    /\[sistema\]/i,
    /system prompt/i,
    /^\s*(rede|categoria|urg[eê]ncia|classifica[cç][aã]o|prioridade|contexto|lead|temperatura|tag|etiqueta|status)\s*:/im,
  ];

  for (const rx of patterns) {
    out = out.replace(rx, "");
  }

  return out.trim();
}

/**
 * Trava de emoji: impede que o agente use emojis em mensagens consecutivas.
 */
export function limitEmojiFrequency(text: string, history: Array<{ sender: string, body: string }> | null | undefined): string {
  if (!history || !Array.isArray(history) || history.length === 0) return text;
  const lastAgentMsg = [...history].reverse().find(m => m.sender === "agente");
  const hasEmoji = (s: string) => /[\u{1F300}-\u{1F9FF}]/u.test(s);
  
  if (lastAgentMsg && hasEmoji(lastAgentMsg.body)) {
    // Remove TODOS os emojis se a anterior já tinha
    return text.replace(/[\u{1F300}-\u{1F9FF}]/gu, "").trim();
  }
  return text;
}

/**
 * Trava de custo: detecta loops verbosos (idoso leigo ou repetição sem avanço).
 */
export function detectVerboseLoop(history: Array<{ sender: string, body: string }>): boolean {
  if (!history || history.length < 8) return false;

  const normalize = (value: string) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const clientMsgs = history
    .filter((m) => m.sender === "cliente")
    .map((m) => normalize(m.body))
    .filter(Boolean);
  if (clientMsgs.length < 4) return false;

  // Só considera loop quando o cliente repete essencialmente a mesma mensagem.
  // Mensagens curtas diferentes (ex.: "boa tarde", "tenho interesse", "Spotify")
  // são progresso normal da conversa e não devem encerrar o atendimento.
  const last4 = clientMsgs.slice(-4);
  const unique = new Set(last4);
  return unique.size <= 2;
}

/**
 * Espelhamento de saudação: garante que a Júlia retribua exatamente o que o cliente disse.
 */
export function pickReengagementGreeting(latestClientMsg: string, nowDate: Date = new Date()): string {
  const s = (latestClientMsg ?? "").toLowerCase();

  // PRIORIDADE 1: Detecção de idioma
  const isEnglish = /\b(hi|hello|hey|good\s*(morning|afternoon|evening|night))\b/i.test(s);
  const isSpanish = /\b(hola|buenos\s*d[ií]as|buenas\s*(tardes|noches))\b/i.test(s);

  if (isEnglish) {
    if (/\bgood\s*morning\b/.test(s)) return "Good morning";
    if (/\bgood\s*afternoon\b/.test(s)) return "Good afternoon";
    if (/\bgood\s*(evening|night)\b/.test(s)) return "Good evening";
    return "Hi";
  }

  if (isSpanish) {
    if (/\bbuenos\s*d[ií]as\b/.test(s)) return "Buenos días";
    if (/\bbuenas\s*tardes\b/.test(s)) return "Buenas tardes";
    if (/\bbuenas\s*noches\b/.test(s)) return "Buenas noches";
    return "Hola";
  }

  // Fallback para Português
  if (/\bbom\s*dia\b/.test(s)) return "Bom dia";
  if (/\bboa\s*tarde\b/.test(s)) return "Boa tarde";
  if (/\bboa\s*noite\b/.test(s)) return "Boa noite";
  
  // Se não encontrou saudação específica, faz o fallback baseado na hora
  const hourBr = (nowDate.getUTCHours() - 3 + 24) % 24;
  if (hourBr >= 5 && hourBr < 12) return "Bom dia";
  if (hourBr >= 12 && hourBr < 18) return "Boa tarde";
  return "Boa noite";
}


export function looksLikeConcreteAction(text: string): boolean {
  return /http|www|\.com|\.br|@/i.test(text);
}

export const VERBOSE_LOOP_FAREWELL = "Pra ver todos os detalhes e fechar rapidinho, acessa mindsmmpanel.com! Lá você consegue ver todos os serviços e preços atualizados em tempo real.";

const REENG_GREETING_START_RX = /^\s*(bom\s*dia|boa\s*tarde|boa\s*noite|oi+|ol[aá]+|opa|eae|e\s*a[ií]|hey|hi|hello|good\s*morning|good\s*afternoon|good\s*evening|hola|buenos\s*d[ií]as|buenas\s*tardes|buenas\s*noches)\b/i;

/**
 * Checa se a mensagem do cliente é puramente uma saudação.
 */
export function isPureGreeting(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  // Se tiver mais de 25 caracteres, provavelmente não é só saudação
  if (normalized.length > 25) return false;
  
  // Lista de saudações comuns
  const commonGreetings = [
    "oi", "ola", "olá", "opa", "bom dia", "boa tarde", "boa noite", 
    "hi", "hello", "hey", "good morning", "good afternoon", "good evening",
    "hola", "buenos dias", "buenos días", "buenas tardes", "buenas noches",
    "tudo bem", "como vai", "tudo bom", "eae", "e ai", "e aí"
  ];
  
  // Remove pontuação para checar
  const plainText = normalized.replace(/[!?.,]/g, "").trim();
  return commonGreetings.includes(plainText);
}

export function enforceReengagementGreeting(text: string, latestClientMsg: string, nowDate: Date = new Date()) {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return { text: trimmed, prepended: false };
  
  // Bug 1: A Júlia já começou com saudação? Se sim, não precisa prepender.
  if (REENG_GREETING_START_RX.test(trimmed)) return { text: trimmed, prepended: false };
  
  // Bug 1: A última mensagem do cliente foi uma saudação PURA?
  // Se não foi, não prepender saudação automaticamente.
  if (!isPureGreeting(latestClientMsg)) return { text: trimmed, prepended: false };
  
  const greeting = pickReengagementGreeting(latestClientMsg, nowDate);
  return { text: `${greeting}! ${trimmed}`, prepended: true };
}

export function humanizePunctuationV3(text: string): string {
  return text.replace(/\s*[—–]\s*/g, ", ").trim();
}
/**
 * Remove Markdown da resposta antes do envio ao WhatsApp.
 * Evita exibir **, __, crases e títulos literais para o cliente.
 */
export function stripMarkdownFormattingV3(text: string): string {
  if (!text) return "";
  return text
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```(?:\w+)?\n?/g, ""))
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "- ")
    .trim();
}
