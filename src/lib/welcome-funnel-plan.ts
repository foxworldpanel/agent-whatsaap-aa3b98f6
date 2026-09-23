import { normalizeTriggerText } from "@/lib/text-normalize";

export type WelcomeFunnelStep = {
  enabled?: boolean;
  text?: string;
  caption?: string;
  url?: string;
  delay_seconds?: number;
};

export const WELCOME_FUNNEL_STEP_ORDER = [
  "welcome_text",
  "audio",
  "panel_text",
  "video",
  "services_text",
] as const;

export type WelcomeFunnelStepKey = (typeof WELCOME_FUNNEL_STEP_ORDER)[number];

export type WelcomeFunnelSteps = Partial<Record<WelcomeFunnelStepKey, WelcomeFunnelStep>>;

export function resolveWelcomeFunnelPlan(steps: WelcomeFunnelSteps | null | undefined) {
  return WELCOME_FUNNEL_STEP_ORDER
    .map((key) => ({ key, step: steps?.[key] }))
    .filter(
      (item): item is { key: WelcomeFunnelStepKey; step: WelcomeFunnelStep } =>
        Boolean(item.step?.enabled),
    );
}

const GENERIC_WELCOME_TRIGGERS = new Set(["oi", "ola", "bom dia", "boa tarde", "boa noite"]);

export function matchesWelcomeFunnelTrigger(triggerKeywords: string, message: string): boolean {
  const normalizedMessage = normalizeTriggerText(message);
  if (!normalizedMessage) return false;
  return String(triggerKeywords || "")
    .split(",")
    .map((value) => normalizeTriggerText(value.trim()))
    .filter(Boolean)
    .some(
      (trigger) =>
        !GENERIC_WELCOME_TRIGGERS.has(trigger) &&
        (normalizedMessage === trigger || normalizedMessage.includes(trigger)),
    );
}

export type WelcomeFunnelResolvedPayload = {
  key: WelcomeFunnelStepKey;
  kind: "texto" | "audio" | "video";
  text?: string;
  url?: string;
  caption?: string;
  delaySeconds: number;
};

export function resolveWelcomeFunnelPayloads(
  steps: WelcomeFunnelSteps | null | undefined,
  fallbackDelaySeconds = 0,
): WelcomeFunnelResolvedPayload[] {
  return resolveWelcomeFunnelPlan(steps).map(({ key, step }) => {
    const delaySeconds = Math.max(
      0,
      Math.min(
        180,
        Number.isFinite(Number(step.delay_seconds))
          ? Number(step.delay_seconds)
          : Number(fallbackDelaySeconds || 0),
      ),
    );
    if (key === "welcome_text" || key === "panel_text" || key === "services_text") {
      const text = step.text?.trim();
      if (!text) throw new Error(`Enabled Welcome Funnel step ${key} has empty text`);
      return { key, kind: "texto" as const, text, delaySeconds };
    }
    const url = step.url?.trim();
    if (!url) throw new Error(`Enabled Welcome Funnel step ${key} has empty url`);
    return {
      key,
      kind: key === "audio" ? "audio" as const : "video" as const,
      url,
      caption: step.caption?.trim() || undefined,
      delaySeconds,
    };
  });
}
