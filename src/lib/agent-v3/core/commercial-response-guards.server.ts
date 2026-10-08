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
  return `Claro! segue o link do painel, lá você cria sua conta, escolhe o serviço e faz o pedido direto.\n\n${MIND_PANEL_URL_V3}`;
}

/** URLs do painel nunca ficam misturadas ao texto comercial. */
export function splitMindPanelUrlPartsV3(value: string): string[] {
  const text = String(value || "").trim();
  if (!text.includes(MIND_PANEL_URL_V3)) return text ? [text] : [];
  const without = text
    .split(MIND_PANEL_URL_V3)
    .join(" ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return [without, MIND_PANEL_URL_V3].filter(Boolean);
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


/**
 * Trava conservadora para fragmentos claramente cortados no fim da geração.
 * Não exige ponto final em conversa normal; só reconhece terminações que,
 * linguisticamente, ainda exigem complemento.
 */
export function repairClearlyIncompleteAgentReplyV3(value: string): string {
  const text = String(value || "").trim();
  if (!text) return text;

  const danglingTail =
    /(?:\b(?:e|ou|mas|porque|pois|que|se|para|pra|com|sem|de|do|da|dos|das|em|no|na|nos|nas|por|pelo|pela|um|uma|uns|umas|o|a|os|as|seu|sua|seus|suas|meu|minha|meus|minhas|durante|entre|sobre|ate|desde|apos|antes|enquanto|caso)\s*|[,;:]\s*)$/iu;
  const danglingConstruction =
    /\b(?:por meio|atraves|a partir|por causa|de acordo|junto|em relacao|em caso|antes de|depois de|alem de|dentro de|fora de|cerca de|perto de|depende de|precisa de|pode ser|vai ser|fica em|acontece em|comeca em|termina em)\s*$/iu;

  if (!danglingTail.test(text) && !danglingConstruction.test(text)) return text;

  // Se já existe uma frase completa antes do fragmento truncado, preserva só
  // o conteúdo completo. Nunca inventa o complemento que o modelo perdeu.
  const completePrefix = text.match(/^([\s\S]*[.!?])(?:\s+[^.!?]*)$/u)?.[1]?.trim();
  if (completePrefix && /[\p{L}\p{N}]/u.test(completePrefix)) return completePrefix;

  // Raiz do antigo loop: uma frase truncada inteira era substituída por
  // "mande sua última mensagem novamente". Em qualquer nova tentativa o mesmo
  // guard podia cair no mesmo fallback, prendendo a conversa. Em vez disso,
  // recuperamos somente o prefixo semanticamente utilizável e encerramos a
  // frase. A regra é independente de intenção, plataforma e etapa comercial.
  let salvaged = text;
  let previous = "";
  while (salvaged !== previous) {
    previous = salvaged;
    salvaged = salvaged.replace(danglingConstruction, "").replace(danglingTail, "").trim();
  }

  if (salvaged.length >= 3 && /[\p{L}\p{N}]/u.test(salvaged)) {
    return /[.!?]$/u.test(salvaged) ? salvaged : `${salvaged}.`;
  }

  // Último fail-safe: nunca cria um pedido de repetição que possa entrar em
  // loop. Mantém o texto original para diagnóstico em vez de fabricar contexto.
  return text;
}

