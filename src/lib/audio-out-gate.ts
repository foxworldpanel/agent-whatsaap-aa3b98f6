// ETAPA 5 — Gate de decisão texto vs áudio na resposta do agente.
//
// Regra antes: se o cliente mandou áudio E ElevenLabs está configurado
// → responde SEMPRE por áudio. Sem gate por conteúdo/tamanho.
//
// Regra nova (deste helper):
//  1) Se a PRIMEIRA parte da resposta contém "conteúdo duro"
//     (URL, domínio, preço R$X, bullet, lista numerada, tutorial 1./2./3.),
//     NUNCA envia por áudio — vai por texto, mesmo que o cliente tenha
//     mandado áudio. Tutorial narrado é péssimo pro cliente seguir.
//  2) Se a primeira parte é longa (> LONG_TEXT_CHARS), também vai por texto
//     — áudio longo cansa e não pode ser relido.
//  3) Caso contrário (mensagem curta e conversacional): mantém áudio.

export const LONG_TEXT_CHARS = 250;

export function hasStructuredContent(text: string): boolean {
  if (!text) return false;
  // URL absoluta
  if (/https?:\/\//i.test(text)) return true;
  // Domínio nu (ex: mindsmmpanel.com)
  if (/\b[\w-]+\.(com|com\.br|net|io|app|co|br)\b/i.test(text)) return true;
  // Preço R$ ou valor decimal (R$15 / 12,50)
  if (/R\$\s?\d|\b\d+[.,]\d{2}\b/.test(text)) return true;
  // Lista com bullet/traço/asterisco no início de linha
  if (/(^|\n)\s*[-*•]\s+\S/m.test(text)) return true;
  // Lista numerada 1. 2) 3- no início de linha (tutorial passo a passo)
  if (/(^|\n)\s*\d+\s*[.\):-]\s+\S/m.test(text)) return true;
  // Passos numerados inline "1) ... 2) ... 3) ..." em sequência (mesmo sem quebra)
  if (/\b1\s*[.\)]\s*\S.+?\b2\s*[.\)]\s*\S/s.test(text)) return true;
  return false;
}

export interface AudioGateDecision {
  audio: boolean;
  reason:
    | "no-input-audio"
    | "no-tts-config"
    | "empty-reply"
    | "structured-content"
    | "too-long"
    | "ok";
  firstPartChars: number;
}

export interface AudioGateInput {
  clientSentAudio: boolean;
  hasElevenLabsKey: boolean;
  hasVoiceId: boolean;
  firstReplyPart: string | undefined;
  maxChars?: number;
}

export function decideAudioOut(input: AudioGateInput): AudioGateDecision {
  const maxChars = input.maxChars ?? LONG_TEXT_CHARS;
  const first = (input.firstReplyPart ?? "").trim();
  const firstPartChars = first.length;
  if (!input.clientSentAudio) return { audio: false, reason: "no-input-audio", firstPartChars };
  if (!input.hasElevenLabsKey || !input.hasVoiceId) {
    return { audio: false, reason: "no-tts-config", firstPartChars };
  }
  if (firstPartChars === 0) return { audio: false, reason: "empty-reply", firstPartChars };
  if (hasStructuredContent(first)) return { audio: false, reason: "structured-content", firstPartChars };
  if (firstPartChars > maxChars) return { audio: false, reason: "too-long", firstPartChars };
  return { audio: true, reason: "ok", firstPartChars };
}