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
    /EXEMPLO_MODELO_DISPARO/,
    /REFINAMENTOS DE TOM/i,
    /REGRA ABSOLUTA DE CONTEXTO/i,
    /SOBRESCREVE/,
    /buildSharedRules/,
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
  if (!history || history.length < 6) return false;
  
  const clientMsgs = history.filter(m => m.sender === "cliente");
  if (clientMsgs.length < 3) return false;
  
  const last3 = clientMsgs.slice(-3);
  
  // Se as últimas 3 mensagens do cliente são muito curtas (< 15 chars)
  const allShort = last3.every(m => m.body.length < 15);
  if (allShort) return true;

  return false;
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

export const VERBOSE_LOOP_FAREWELL = "Entendo! Como não conseguimos avançar por aqui, o suporte pode te ajudar com mais detalhes. Se precisar de algo no futuro, é só chamar! (suporte pode te ajudar)";

const REENG_GREETING_START_RX = /^\s*(bom\s*dia|boa\s*tarde|boa\s*noite|oi+|ol[aá]+|opa|eae|e\s*a[ií]|hey|hi|hello|good\s*morning|good\s*afternoon|good\s*evening|hola|buenos\s*d[ií]as|buenas\s*tardes|buenas\s*noches)\b/i;

export function enforceReengagementGreeting(text: string, latestClientMsg: string, nowDate: Date = new Date()) {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return { text: trimmed, prepended: false };
  if (REENG_GREETING_START_RX.test(trimmed)) return { text: trimmed, prepended: false };
  
  const greeting = pickReengagementGreeting(latestClientMsg, nowDate);
  console.log(`[agent-v3] Guard: Prepending "${greeting}" to text. Full: "${greeting}! ${trimmed}"`);
  return { text: `${greeting}! ${trimmed}`, prepended: true };
}

export function humanizePunctuationV3(text: string): string {
  return text.replace(/\s*[—–]\s*/g, ", ").trim();
}