export type AgentHumanizationSettings = {
  enabled: boolean;
  min_response_delay_ms: number;
  max_response_delay_ms: number;
  typing_enabled: boolean;
  proportional_to_length: boolean;
  min_part_delay_ms: number;
  max_part_delay_ms: number;
  audio_recording_enabled: boolean;
  playground_delay_enabled: boolean;
};

export const DEFAULT_AGENT_HUMANIZATION: AgentHumanizationSettings = {
  enabled: true,
  min_response_delay_ms: 1500,
  max_response_delay_ms: 8000,
  typing_enabled: true,
  proportional_to_length: true,
  min_part_delay_ms: 1200,
  max_part_delay_ms: 2800,
  audio_recording_enabled: true,
  playground_delay_enabled: false,
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export function normalizeHumanizationSettings(
  raw?: Partial<AgentHumanizationSettings> | null,
): AgentHumanizationSettings {
  const merged = { ...DEFAULT_AGENT_HUMANIZATION, ...(raw || {}) };
  const minResponse = clamp(Number(merged.min_response_delay_ms) || 1500, 0, 120_000);
  const maxResponse = clamp(
    Number(merged.max_response_delay_ms) || 8000,
    minResponse,
    120_000,
  );
  const minPart = clamp(Number(merged.min_part_delay_ms) || 1200, 0, 30_000);
  const maxPart = clamp(
    Number(merged.max_part_delay_ms) || 2800,
    minPart,
    30_000,
  );

  return {
    enabled: merged.enabled !== false,
    min_response_delay_ms: minResponse,
    max_response_delay_ms: maxResponse,
    typing_enabled: merged.typing_enabled !== false,
    proportional_to_length: merged.proportional_to_length !== false,
    min_part_delay_ms: minPart,
    max_part_delay_ms: maxPart,
    audio_recording_enabled: merged.audio_recording_enabled !== false,
    playground_delay_enabled: merged.playground_delay_enabled === true,
  };
}

function randomBetween(min: number, max: number, randomValue = Math.random()): number {
  if (max <= min) return min;
  return Math.round(min + clamp(randomValue, 0, 1) * (max - min));
}

/**
 * Tempo-alvo total entre a chegada da mensagem e o primeiro envio.
 *
 * Preset padrão:
 * - mensagens muito curtas: ~1,5–3s
 * - preço/resposta curta: ~2–4,5s
 * - 2–3 frases: ~3,5–6s
 * - respostas maiores: até ~8s
 *
 * A pequena variação impede um padrão robótico de "sempre X segundos".
 */
export function calculateHumanResponseTargetMs(
  text: string,
  settings: AgentHumanizationSettings,
  randomValue = Math.random(),
): number {
  if (!settings.enabled) return 0;

  if (!settings.proportional_to_length) {
    return randomBetween(
      settings.min_response_delay_ms,
      settings.max_response_delay_ms,
      randomValue,
    );
  }

  const chars = Math.max(0, String(text || "").trim().length);
  const span = settings.max_response_delay_ms - settings.min_response_delay_ms;
  // 0–500 caracteres percorrem progressivamente toda a janela configurada.
  const lengthRatio = Math.min(chars, 500) / 500;
  const base = settings.min_response_delay_ms + span * lengthRatio;
  // Jitter de ±18%, limitado aos extremos definidos no painel.
  const jitter = (clamp(randomValue, 0, 1) - 0.5) * 0.36;
  return Math.round(
    clamp(
      base * (1 + jitter),
      settings.min_response_delay_ms,
      settings.max_response_delay_ms,
    ),
  );
}

export function calculatePartDelayMs(
  settings: AgentHumanizationSettings,
  randomValue = Math.random(),
): number {
  if (!settings.enabled) return 0;
  return randomBetween(
    settings.min_part_delay_ms,
    settings.max_part_delay_ms,
    randomValue,
  );
}

export async function sleepMs(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}
