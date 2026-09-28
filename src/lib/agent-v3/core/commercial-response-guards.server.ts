// Deterministic commercial-response guards learned from real conversations.

export const MIND_PANEL_URL_V3 = "https://mindsmmpanel.com";

function normalize(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function isExplicitPanelLinkRequestV3(message: string): boolean {
  const text = normalize(message);
  if (!text) return false;
  const asksAccess = /\b(site|link|painel|cadastro|cadastrar|criar conta|acessar|acesso)\b/.test(text);
  const request = /\b(tem|manda|mande|passa|passe|envia|envie|qual|onde|quero|pra|para)\b/.test(text);
  return asksAccess && request;
}

export function panelLinkReplyV3(): string {
  return `Claro! O site é ${MIND_PANEL_URL_V3}. Lá você cria sua conta, escolhe o serviço e faz o pedido direto.`;
}

export function saysPreviouslyUsedMindV3(message: string): boolean {
  return /\b(ja usei|ja utilizei|usei antes|utilizei antes|ja fui cliente|sou cliente|ja conheco (?:o sistema|a plataforma))\b/.test(normalize(message));
}

export function isLowInformationSocialMessageV3(message: string): boolean {
  const text = String(message || "").trim();
  if (!text) return true;
  // Remove emoji/símbolos/pontuação. Se não restar letra/número, é reação social.
  return !/[\p{L}\p{N}]/u.test(text);
}
