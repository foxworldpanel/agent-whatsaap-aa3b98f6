// Smart Router V3 — decide se uma mensagem deve ser respondida por código
// (sem chamar o Claude), ficar em silêncio, ou seguir pro fluxo normal.
//
// REGRA DE ARQUITETURA: este módulo NUNCA importa Uazapi, Supabase, ou
// qualquer coisa de envio/persistência. Ele só recebe texto + contexto e
// devolve uma decisão. Isso o torna reutilizável em qualquer canal
// (WhatsApp, Playground, futuro Instagram/Telegram/Widget) sem
// acoplamento.
//
// FASE 1 — escopo mínimo, deliberado: só saudação pura e agradecimento
// puro. Qualquer ambiguidade cai pra "claude". Novas rotas (tabela,
// status de pedido, etc.) entram aqui no futuro, nunca dentro do
// webhook.

import { isPureGreeting, pickReengagementGreeting } from "../brain/guards.server";

export type SmartRouterRoute = "code" | "claude" | "silent";

export type SmartRouterResult = {
  handled: boolean;
  response?: string;
  reason: string;
  route: SmartRouterRoute;
};

export type SmartRouterContext = {
  isFirstTurn: boolean;
  funnelAlreadyCompleted: boolean;
  nowDate?: Date;
};

const THANKS_ONLY_PATTERN = /^(?:obrigad[oa]s?|valeu|vlw|muito\s+obrigad[oa])[!.]*$/i;

export function routeMessage(message: string, context: SmartRouterContext): SmartRouterResult {
  const trimmed = String(message || "").trim();

  if (!trimmed) {
    return { handled: false, reason: "MENSAGEM_VAZIA", route: "claude" };
  }

  if (isPureGreeting(trimmed)) {
    const greetingWord = pickReengagementGreeting(trimmed, context.nowDate ?? new Date());
    const response =
      context.isFirstTurn && !context.funnelAlreadyCompleted
        ? `${greetingWord}! Tudo bem? Aqui é a Júlia da Mind. Como posso te ajudar?`
        : `${greetingWord}! Tudo bem?`;
    return { handled: true, response, reason: "GREETING", route: "code" };
  }

  if (THANKS_ONLY_PATTERN.test(trimmed)) {
    return { handled: true, response: "Por nada! 😊", reason: "THANKS", route: "code" };
  }

  return { handled: false, reason: "SEM_ROTA_DETERMINISTICA", route: "claude" };
}
