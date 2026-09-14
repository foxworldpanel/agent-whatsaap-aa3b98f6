// Smart Router V3 — deterministic low-risk routes before Claude.

import { isPureGreeting, pickReengagementGreeting } from "../brain/guards.server";
import { PURE_INTEREST_PHRASES, PLATFORM_ISOLATED_MAP } from "./router-constants";
import { removeAccents } from "../../text-normalize";

export type SmartRouterRoute = "code" | "claude" | "silent";
export type SmartRouterDecisionContext = { routeReason: string; platformDetected?: string };
export type SmartRouterResult = {
  handled: boolean;
  response?: string;
  reason: string;
  route: SmartRouterRoute;
  context: SmartRouterDecisionContext;
};
export type SmartRouterContext = {
  isFirstTurn: boolean;
  funnelAlreadyCompleted: boolean;
  nowDate?: Date;
};

const THANKS_ONLY_PATTERN = /^(?:obrigad[oa]s?|valeu|vlw|muito\s+obrigad[oa])[!.]*$/i;

function normalizeForRouter(text: string): string {
  return text.trim().toLowerCase().replace(/[!?.,]/g, "").trim();
}

function isPureInitialInterest(text: string): boolean {
  const normalized = removeAccents(normalizeForRouter(text));
  if (normalized.length > 40) return false;
  return PURE_INTEREST_PHRASES.has(normalized);
}

function detectIsolatedPlatform(text: string): string | null {
  const normalized = removeAccents(normalizeForRouter(text));
  if (normalized.length > 20) return null;
  return PLATFORM_ISOLATED_MAP[normalized] ?? null;
}

export function routeMessage(message: string, context: SmartRouterContext): SmartRouterResult {
  const trimmed = String(message || "").trim();

  if (!trimmed) {
    return { handled: false, reason: "MENSAGEM_VAZIA", route: "claude", context: { routeReason: "MENSAGEM_VAZIA" } };
  }

  if (isPureGreeting(trimmed)) {
    const greetingWord = pickReengagementGreeting(trimmed, context.nowDate ?? new Date());
    // Welcome Funnel owns the first introduction. Once it has already run, a
    // greeting-only turn must not reopen onboarding or add a new qualification CTA.
    const response = context.funnelAlreadyCompleted
      ? `${greetingWord}!`
      : context.isFirstTurn
        ? `${greetingWord}! Tudo bem? Aqui é a Júlia da Mind. Como posso te ajudar?`
        : `${greetingWord}! Tudo bem?`;
    return { handled: true, response, reason: "GREETING", route: "code", context: { routeReason: "GREETING" } };
  }

  if (THANKS_ONLY_PATTERN.test(trimmed)) {
    return { handled: true, response: "Por nada! 😊", reason: "THANKS", route: "code", context: { routeReason: "THANKS" } };
  }

  if (isPureInitialInterest(trimmed)) {
    return {
      handled: true,
      response: "Em qual plataforma você deseja divulgar? Trabalhamos com Spotify, YouTube, Instagram, TikTok, Facebook e Kwai.",
      reason: "INITIAL_INTEREST",
      route: "code",
      context: { routeReason: "INITIAL_INTEREST" },
    };
  }

  const isolatedPlatform = detectIsolatedPlatform(trimmed);
  if (isolatedPlatform) {
    return {
      handled: false,
      reason: `PLATFORM:${isolatedPlatform}`,
      route: "claude",
      context: { routeReason: `PLATFORM:${isolatedPlatform}`, platformDetected: isolatedPlatform },
    };
  }

  return {
    handled: false,
    reason: "SEM_ROTA_DETERMINISTICA",
    route: "claude",
    context: { routeReason: "SEM_ROTA_DETERMINISTICA" },
  };
}