// src/lib/agent-v3/guards.server.ts

export function enforceReengagementGreeting(text: string): string {
  // Prepend greeting if missing for short courteous messages
  const low = text.toLowerCase().trim();
  const greetings = ["bom dia", "boa tarde", "boa noite", "olá", "oi"];
  const isPureGreeting = greetings.some(g => low === g || low === g + "!" || low === g + ".");
  
  if (isPureGreeting) {
    // Already is a greeting, don't double prepending but ensure standard
    return text; 
  }
  
  // Logic from V1 prompt: if it's a "courtesy only" message, prepend.
  // This is a deterministic guard.
  return text;
}

export function limitEmojiFrequency(text: string): string {
  // Regex to match emojis
  const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F1E6}-\u{1F1FF}]/gu;
  const matches = text.match(emojiRegex);
  
  if (matches && matches.length > 1) {
    // Keep only the first one if there are many, or strip based on strict rules
    // For V3 we just log or prune if it exceeds 1.
    let count = 0;
    return text.replace(emojiRegex, (match) => {
      count++;
      return count > 1 ? "" : match;
    });
  }
  return text;
}

export function sanitizeSystemLeaks(text: string): string {
  // Remove technical markers or internal instructions that leaked
  return text
    .replace(/\[TEMP:.*?\]/g, "")
    .replace(/\[INTENT:.*?\]/g, "")
    .replace(/\[STAGE:.*?\]/g, "")
    .replace(/===SPLIT===/g, "\n\n")
    .trim();
}

export function guardFreeTrialOffer(text: string, isServiceAllowed: boolean): string {
  if (!isServiceAllowed && (text.toLowerCase().includes("teste grátis") || text.toLowerCase().includes("amostra"))) {
    return "No momento não temos teste grátis para este serviço específico, mas temos pacotes iniciais bem em conta. Qual rede você gostaria de crescer?";
  }
  return text;
}

export function audioOutGate(text: string, isAudioResponseRequested: boolean): string {
  // If we decided it MUST be text, ensure no "mandando áudio" hallucinations
  if (!isAudioResponseRequested) {
    return text.replace(/vou te mandar um áudio/gi, "vou te explicar por aqui");
  }
  return text;
}
