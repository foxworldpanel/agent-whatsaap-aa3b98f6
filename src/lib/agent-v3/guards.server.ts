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
export function limitEmojiFrequency(text: string, history: Array<{ sender: string, body: string }>): string {
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
  if (history.length < 6) return false;
  const lastClientMsgs = history.filter(m => m.sender === "cliente").slice(-3);
  if (lastClientMsgs.length < 3) return false;

  // Se as últimas 3 mensagens do cliente são muito curtas (< 15 chars) e similares
  const allShort = lastClientMsgs.every(m => m.body.length < 15);
  if (allShort) return true;

  return false;
}

/**
 * Espelhamento de saudação: garante que a Júlia retribua exatamente o que o cliente disse.
 */
export function pickReengagementGreeting(latestClientMsg: string, nowDate: Date = new Date()): string {
  const s = (latestClientMsg ?? "").toLowerCase();
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

export const VERBOSE_LOOP_FAREWELL = "Entendo! Como não conseguimos avançar por aqui, vou deixar você à vontade. Se precisar de algo no futuro, é só chamar!";

const REENG_GREETING_START_RX = /^\s*(bom\s*dia|boa\s*tarde|boa\s*noite|oi+|ol[aá]+|opa|eae|e\s*a[ií]|hey|hi|hello)\b/i;

export function enforceReengagementGreeting(text: string, latestClientMsg: string, nowDate: Date = new Date()) {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return { text: trimmed, prepended: false };
  if (REENG_GREETING_START_RX.test(trimmed)) return { text: trimmed, prepended: false };
  
  const greeting = pickReengagementGreeting(latestClientMsg, nowDate);
  return { text: `${greeting}! ${trimmed}`, prepended: true };
}

export function humanizePunctuationV3(text: string): string {
  return text.replace(/\s*[—–]\s*/g, ", ").trim();
}