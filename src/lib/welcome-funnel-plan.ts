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
