const STOP_PATTERNS = [
  /^\s*(pare|parar|stop|unsubscribe)\s*[.!]?\s*$/i,
  /\bn[aã]o\s+quero\s+mais\s+(mensagens?|contato|receber)/i,
  /\bn[aã]o\s+me\s+(mande|manda|envie|mandar)\s+mais/i,
  /\bpare\s+de\s+(mandar|enviar)/i,
  /\bsai[ar]?\s+da\s+lista\b/i,
  /\bdescadastr/i,
  /\bme\s+tira\s+(daqui|da[ií]|da\s+lista|dos\s+contatos)/i,
];

const HUMAN_HANDOFF_PATTERNS = [
  /\bfalar\s+com\s+(?:um\s+|uma\s+)?(?:atendente\s+)?humano\b/i,
  /\bfalar\s+com\s+(?:um\s+|uma\s+)?pessoa\b/i,
  /\bquero\s+falar\s+com\s+(?:um\s+|uma\s+)?(?:atendente\s+)?humano\b/i,
  /\bquero\s+falar\s+com\s+(?:uma\s+)?pessoa\b/i,
  /\bquero\s+(?:um\s+|uma\s+)?atendente\b/i,
  /\batendente\s+humano\b/i,
  /\bpessoa\s+de\s+verdade\b/i,
  /\bfalar\s+com\s+humano\b/i,
  /\bsem\s+ser\s+(?:um\s+)?rob[oô]\b/i,
  /\bsem\s+rob[oô]\b/i,
  /\bn[aã]o\s+quero\s+(?:falar\s+)?com\s+(?:um\s+)?rob[oô]\b/i,
  /\bquero\s+(?:falar\s+)?com\s+algu[eé]m\s+(?:de\s+verdade|da\s+equipe)\b/i,
  /\bme\s+passa\s+(?:para|pra)\s+(?:um\s+|uma\s+)?atendente\b/i,
];

function normalizeEscalationText(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function isStopRequest(text: string): boolean {
  return !!text && STOP_PATTERNS.some((re) => re.test(text));
}

export function isHumanHandoffRequest(text: string): boolean {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  return !!normalized && HUMAN_HANDOFF_PATTERNS.some((re) => re.test(normalized));
}

export async function traceFunnel(
  supabaseAdmin: any,
  msgId: string,
  phone: string | undefined,
  step: string,
  details: Record<string, unknown>,
): Promise<void> {
  try {
    await supabaseAdmin.from("funnel_debug_trace").insert({ msg_id: msgId, phone: phone ?? null, step, details });
  } catch (error) {
    console.warn("[FUNNEL-TRACE] Falha ao gravar checkpoint (não bloqueia o fluxo):", error);
  }
}

export function evaluateCriticalHumanEscalation(params: {
  currentText: string;
  recentCustomerText?: string;
}): { escalate: boolean; reason?: string } {
  const current = normalizeEscalationText(params.currentText);
  const journey = normalizeEscalationText(`${params.recentCustomerText || ""} ${params.currentText}`);
  const legalRisk = /\b(denuncia|denunciar|procon|advogad[oa]|processo|processar|acao judicial|justica|boletim de ocorrencia|policia|reclamacao formal|chargeback|contestacao do pagamento)\b/.test(journey);
  if (legalRisk) return { escalate: true, reason: "risco de denúncia, contestação ou escalada jurídica" };
  const supportUnavailable = /\b(nao consigo (?:abrir|acessar|falar com) (?:o )?suporte|sem acesso (?:ao|a) suporte|suporte (?:esta )?bloqueado|bloquead[oa].{0,45}suporte|nao tenho acesso ao suporte|nao da.{0,30}(?:ticket|suporte)|ticket.{0,30}(?:bloqueado|nao abre|nao funciona)|volta (?:a|para) pagina inicial)\b/.test(journey);
  const unresolvedSupport = /\b(nao resolvem|nao respondem|ninguem responde|ja reclamei|reclamei e|sem solucao|nao solucionaram|continuo com o problema)\b/.test(journey);
  const operationalProblem = /\b(pedido|id\s*:?\s*\d{5,}|seguidores?|plays?|ouvintes?|likes?|visualizacoes?|compra|saldo|credito|reposicao|garantia|caiu|perdi|parado|processando|nao chegou|nao recebi|faltam?|bloquead[oa]|restric|reembolso)\b/.test(journey);
  const severeLossOrBlock = /\b(perdi (?:quase )?todos|ficou (?:com )?menos de|me bloquearam|estou bloquead[oa]|conta bloqueada|restricao na conta)\b/.test(journey);
  if (operationalProblem && supportUnavailable) return { escalate: true, reason: "problema de pedido/conta com suporte inacessível" };
  if (operationalProblem && unresolvedSupport && severeLossOrBlock) return { escalate: true, reason: "reclamação crítica não resolvida" };
  const currentHasBlockedSupport = /\b(bloquead[oa]|sem acesso|nao consigo)\b/.test(current) && /\b(suporte|ticket|reclam)\b/.test(current) && operationalProblem;
  if (currentHasBlockedSupport) return { escalate: true, reason: "cliente sem canal funcional para resolver suporte" };
  const buyingJourney = /\b(compr|pagar|pagamento|pix|recarga|saldo|cadastro|cadastrar|pedido|1000|mil|r\$)\b/.test(journey);
  const technicalBlock = /\b(nao funciona|nao abre|nao aparece|nao completa|nao consigo|nao avanca|erro|trav|volta (?:a|para) pagina|pagamento nao aparece|saldo nao aparece|cadastro nao)\b/.test(journey);
  const troubleshootingLoop = (journey.match(/\b(cache|cookies?|outro navegador|ticket|tente novamente|atualiz|cadastro|pagamento)\b/g) || []).length >= 3;
  if (buyingJourney && technicalBlock && troubleshootingLoop) return { escalate: true, reason: "venda bloqueada por problema técnico no cadastro/pagamento" };
  return { escalate: false };
}

export async function detectCriticalHumanEscalation(params: {
  supabaseAdmin: any;
  conversationId?: string | null;
  currentText: string;
}): Promise<{ escalate: boolean; reason?: string }> {
  let recentCustomerText = "";
  if (params.conversationId) {
    const { data, error } = await params.supabaseAdmin.from("messages").select("body, created_at")
      .eq("conversation_id", params.conversationId).eq("sender", "cliente")
      .order("created_at", { ascending: false }).limit(20);
    if (error) console.warn("[HUMAN-ESCALATION] Falha ao ler histórico recente:", error);
    else recentCustomerText = (data || []).map((row: any) => String(row?.body || "")).reverse().join(" ");
  }
  return evaluateCriticalHumanEscalation({ currentText: params.currentText, recentCustomerText });
}

export function shouldReplyWithAudio(params: {
  inputKind: "texto" | "audio" | "image" | "sticker";
  replyText: string;
  intent?: string;
  stage?: string;
}): boolean {
  if (params.inputKind !== "audio") return false;
  const text = String(params.replyText || "").trim();
  if (!text) return false;
  const sentenceCount = text.split(/[.!?]+/).map((part) => part.trim()).filter(Boolean).length;
  const intent = String(params.intent || "").toLowerCase();
  const stage = String(params.stage || "").toLowerCase();
  const complexIntent = intent.includes("tecnico") || intent.includes("suporte") || intent.includes("tutorial") || intent.includes("explic") || intent.includes("duvida_complexa");
  const complexStage = stage.includes("suporte") || stage.includes("resolucao") || stage.includes("diagnostico");
  const hasSteps = /\b(passo a passo|primeiro|depois|em seguida|acesse|vá até|clique|selecione|configure)\b/i.test(text);
  return text.length >= 260 || sentenceCount >= 4 || complexIntent || complexStage || (hasSteps && text.length >= 160);
}
