// src/lib/agent-v3/guards.server.ts

export function sanitizeSystemLeaks(text: string): string {
  return text.replace(/\[TEMP:.*?\]|\[INTENT:.*?\]|\[STAGE:.*?\]/g, "").trim();
}

export function limitEmojiFrequency(text: string, history: Array<{ sender: string, body: string }>): string {
  const lastAgentMsg = [...history].reverse().find(m => m.sender === "agente");
  const hasEmoji = (s: string) => /[\u{1F300}-\u{1F9FF}]/u.test(s);
  
  if (lastAgentMsg && hasEmoji(lastAgentMsg.body)) {
    return text.replace(/[\u{1F300}-\u{1F9FF}]/u, "");
  }
  return text;
}

export function enforceReengagementGreeting(text: string, greeting: string = "Oi! Como posso ajudar?") {
  const greetings = ["oi", "olá", "bom dia", "boa tarde", "boa noite", "oopa", "opa"];
  const lower = text.toLowerCase();
  const hasGreeting = greetings.some(g => lower.startsWith(g));
  
  if (!hasGreeting) {
    return { text: `${greeting} ${text}`, prepended: true };
  }
  return { text, prepended: false };
}

export function humanizePunctuationV3(text: string): string {
  return text.replace(/\s*—\s*/g, " - ").replace(/\s*–\s*/g, " - ").trim();
}
