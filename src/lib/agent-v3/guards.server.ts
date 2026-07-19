// src/lib/agent-v3/guards.server.ts

export function sanitizeSystemLeaks(text: string): string {
  if (!text) return "";
  let processed = text;
  // Remove menções a metadados se vazarem (V3 usa marcadores [TEMP], etc)
  processed = processed.replace(/\[TEMP:.*?\]/g, "");
  processed = processed.replace(/\[INTENT:.*?\]/g, "");
  processed = processed.replace(/\[STAGE:.*?\]/g, "");
  return processed.trim();
}

export function limitEmojiFrequency(text: string): string {
  if (!text) return "";
  // Implementação simples para V3: max 1 emoji por mensagem
  const emojis = text.match(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu) || [];
  if (emojis.length <= 1) return text;
  
  let count = 0;
  return text.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, (match) => {
    count++;
    return count === 1 ? match : "";
  });
}

export function enforceReengagementGreeting(text: string): string {
  // Se for uma saudação neutra detectada, pode-se prepend uma saudação amigável
  return text;
}

export function humanizePunctuationV3(text: string): string {
  if (!text) return "";
  // Remove travessões (em-dash e en-dash) que o Claude ama usar
  return text.replace(/—/g, "-").replace(/–/g, "-");
}

export function guardFreeTrialOffer(reply: string, freeTestServices: any[]): { text: string; replaced: boolean } {
  const hasOffer = /teste gr[aá]tis|degusta[çc][aã]o/i.test(reply);
  if (hasOffer && (!freeTestServices || freeTestServices.length === 0)) {
    return {
      text: "No momento não temos teste grátis disponível, mas nossos pacotes iniciais são bem acessíveis!",
      replaced: true
    };
  }
  return { text: reply, replaced: false };
}
