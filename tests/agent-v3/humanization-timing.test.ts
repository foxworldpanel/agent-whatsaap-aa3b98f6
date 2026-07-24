import { describe, expect, it } from "vitest";
import {
  DEFAULT_AGENT_HUMANIZATION,
  calculateHumanResponseTargetMs,
  calculatePartDelayMs,
  normalizeHumanizationSettings,
} from "../../src/lib/agent-v3/humanization.server";

describe("Agent V3 humanization timing", () => {
  it("respostas maiores nunca recebem menos tempo que respostas muito curtas com o mesmo jitter", () => {
    const settings = DEFAULT_AGENT_HUMANIZATION;
    const short = calculateHumanResponseTargetMs("Oi!", settings, 0.5);
    const long = calculateHumanResponseTargetMs("x".repeat(400), settings, 0.5);
    expect(long).toBeGreaterThan(short);
  });

  it("respeita a janela padrão de 1,5 a 8 segundos", () => {
    const settings = DEFAULT_AGENT_HUMANIZATION;
    for (const length of [1, 30, 100, 250, 500, 1000]) {
      const ms = calculateHumanResponseTargetMs("x".repeat(length), settings, 0.5);
      expect(ms).toBeGreaterThanOrEqual(1500);
      expect(ms).toBeLessThanOrEqual(8000);
    }
  });

  it("intervalo entre partes fica entre 1,2 e 2,8 segundos", () => {
    const settings = DEFAULT_AGENT_HUMANIZATION;
    expect(calculatePartDelayMs(settings, 0)).toBe(1200);
    expect(calculatePartDelayMs(settings, 1)).toBe(2800);
  });

  it("playground fica sem atraso por padrão", () => {
    expect(normalizeHumanizationSettings(null).playground_delay_enabled).toBe(false);
  });
});
