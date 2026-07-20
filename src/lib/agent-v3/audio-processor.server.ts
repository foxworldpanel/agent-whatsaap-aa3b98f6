// src/lib/agent-v3/audio-processor.server.ts
import { transcribeAudioUrl } from "@/lib/ai.server";
import { autoSplitLongParts as legacySplitter } from "@/lib/message-splitter";

export async function processAudioV3(audioUrl: string, openaiApiKey?: string): Promise<string> {
  if (!audioUrl) throw new Error("Audio URL is required");

  console.info("[agent-v3] Starting audio transcription...");
  const transcript = await transcribeAudioUrl(audioUrl, openaiApiKey);

  // RIGOROUS VALIDATION
  if (typeof transcript !== 'string') {
    console.error("[agent-v3] Transcription returned non-string type:", typeof transcript);
    throw new Error("Falha crítica na transcrição: resultado não é uma string");
  }

  if (transcript === '[object Object]') {
    console.error("[agent-v3] Transcription returned [object Object]");
    throw new Error("Falha crítica na transcrição: resultado inválido ([object Object])");
  }

  const cleaned = transcript.trim();
  if (!cleaned || cleaned.length === 0) {
    console.warn("[agent-v3] Empty transcription result");
    return "[áudio sem conteúdo legível]";
  }

  console.info(`[agent-v3] Transcription successful: ${cleaned.length} chars`);
  return cleaned;
}

export function autoSplitLongPartsV3(text: string): string[] {
  if (typeof text !== 'string') return [];
  const trimmed = text.trim();
  if (!trimmed) return [];
  
  // 1. Split por marcador explícito
  const explicitParts = trimmed.split(/===SPLIT===/i).map(p => p.trim()).filter(p => p.length > 0);
  console.log(`[agent-v3] Split: Explicit parts count: ${explicitParts.length}`);
  
  // 2. Aplicar o splitter de parágrafos em cada parte
  const result = legacySplitter(explicitParts);
  console.log(`[agent-v3] Split: Final parts count: ${result.length}`);
  
  // 3. Garantia: se resultou vazio mas havia texto, retorna o texto original limpo
  if (result.length === 0 && trimmed.length > 0) {
    return [trimmed];
  }
  
  return result;
}
