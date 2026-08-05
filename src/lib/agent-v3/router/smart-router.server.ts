// Smart Router V3 — decide se uma mensagem deve ser respondida por código
// (sem chamar o Claude), ficar em silêncio, ou seguir pro fluxo normal.
//
// REGRA DE ARQUITETURA: este módulo NUNCA importa Uazapi, Supabase, ou
// qualquer coisa de envio/persistência. Ele só recebe texto + contexto e
// devolve uma decisão. Isso o torna reutilizável em qualquer canal
// (WhatsApp, Playground, futuro Instagram/Telegram/Widget) sem
// acoplamento.
//
// Pacote 5A (Behavior Engineering) — rotas adicionadas: saudação e
// agradecimento (já existiam), interesse inicial (nova) e reconhecimento
// de plataforma isolada (nova, não intercepta — só loga e segue pro
// Claude). Rotas que dependem de responder com módulos GLOBAL
// (pagamento, segurança, suporte, como comprar) ficam pro Pacote 5B,
// depois de avaliar se esses módulos servem pra resposta direta sem
// adaptação de texto.

import { isPureGreeting, pickReengagementGreeting } from "../brain/guards.server";
import { PURE_INTEREST_PHRASES, PLATFORM_ISOLATED_MAP } from "./router-constants";

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

// Frases curtas e exatas de interesse inicial — mesmo padrão de segurança
// usado em isPureGreeting: exige que a mensagem seja SUBSTANCIALMENTE só
// essa frase (com pontuação leve tolerada), nunca "contains", pra evitar
// o mesmo tipo de falso positivo já corrigido antes nesta auditoria
// (palavra genérica isolada disparando rota errada).
function normalizeForRouter(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[!?.,]/g, "")
    .trim();
}

function isPureInitialInterest(text: string): boolean {
  const normalized = normalizeForRouter(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (normalized.length > 40) return false; // mensagem longa não é "pura"
  return PURE_INTEREST_PHRASES.has(normalized);
}

function detectIsolatedPlatform(text: string): string | null {
  const normalized = normalizeForRouter(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (normalized.length > 20) return null; // "isolada" = só o nome, não frase
  return PLATFORM_ISOLATED_MAP[normalized] ?? null;
}

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

  if (isPureInitialInterest(trimmed)) {
    return {
      handled: true,
      response: "Em qual plataforma você deseja divulgar? Trabalhamos com Spotify, YouTube, Instagram, TikTok, Facebook e Kwai.",
      reason: "INITIAL_INTEREST",
      route: "code",
    };
  }

  const isolatedPlatform = detectIsolatedPlatform(trimmed);
  if (isolatedPlatform) {
    // Não intercepta — só reconhece e loga. O Agent V3 continua sendo
    // chamado normalmente, exatamente como pedido no Pacote 5A.
    return { handled: false, reason: `PLATFORM:${isolatedPlatform}`, route: "claude" };
  }

  return { handled: false, reason: "SEM_ROTA_DETERMINISTICA", route: "claude" };
}
