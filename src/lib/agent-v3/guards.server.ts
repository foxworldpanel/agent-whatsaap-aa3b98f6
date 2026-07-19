// src/lib/agent-v3/guards.server.ts
import { containsEmoji, stripEmojis, limitEmojiFrequency as limitEmojiV1 } from "@/lib/emoji-limiter";

export function sanitizeSystemLeaks(text: string): string {
  if (!text) return "";
  return text
    .replace(/\[TEMP:[^\]]*\]/g, "")
    .replace(/\[INTENT:[^\]]*\]/g, "")
    .replace(/\[STAGE:[^\]]*\]/g, "")
    .trim();
}

export function limitEmojiFrequency(text: string, history: any[] = []): string {
  return limitEmojiV1(text, { 
    history: history.map(h => ({ body: h.body || h.text })),
    isBlastOpening: false 
  });
}

export function enforceReengagementGreeting(text: string, greeting: string = "Olá!"): { text: string; prepended: boolean } {
  if (!text) return { text: greeting, prepended: true };
  
  const greetings = ["oi", "olá", "ola", "bom dia", "boa tarde", "boa noite"];
  const startLower = text.toLowerCase().trim();
  const hasGreeting = greetings.some(g => startLower.startsWith(g));
  
  if (!hasGreeting) {
    return { text: `${greeting} ${text}`, prepended: true };
  }
  
  return { text, prepended: false };
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
