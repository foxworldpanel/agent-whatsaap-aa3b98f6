import { createFileRoute } from "@tanstack/react-router";
import { sendAgentTextGuarded } from "@/lib/send-agent-guarded.server";
import { normalizeTriggerText, removeAccents } from "@/lib/text-normalize";
import { isConversationAgentEnabledV3 } from "@/lib/agent-v3/brain/config.server";
import { generateTraceId, logExecutionTrace } from "@/lib/agent-v3/telemetry/execution-tracer.server";
import {
  beginWebhookAgentInboundRuntime,
  finishWebhookAgentInboundRuntime,
} from "@/lib/agent-v3/inbound-webhook-ownership.server";
import { executeAgentV3Runtime } from "@/lib/agent-v3/runtime.server";

// Uazapi webhook receiver.
// Configure em Uazapi → Webhooks: POST {site}/api/public/hooks/uazapi-webhook
// Eventos: messages (mensagens recebidas).

// Serializa o processamento do agente por conversa dentro da mesma instância.
// Isso evita que duas mensagens quase simultâneas leiam o mesmo histórico e
// sobrescrevam uma à outra no saveConversationStateV3. Em ambientes com várias
// instâncias, a garantia definitiva ainda deve ser feita no banco/queue.
const conversationLocks = new Map<string, Promise<void>>();
async function withConversationLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = conversationLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.catch(() => undefined).then(() => current);
  conversationLocks.set(key, tail);

  await previous.catch(() => undefined);
  try {
    return await task();
  } finally {
    release();
    if (conversationLocks.get(key) === tail) conversationLocks.delete(key);
  }
}

// Lock persistente por conversation_id para proteger também ambientes com
// múltiplas instâncias/processos. A PK da tabela torna a aquisição atômica.
const DB_CONVERSATION_LOCK_STALE_MS = 5 * 60 * 1000;

async function acquireConversationDbLock(
  supabaseAdmin: any,
  conversationId: string,
  holder: string,
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from("agent_generation_locks")
    .insert({ conversation_id: conversationId, holder, acquired_at: new Date().toISOString() });

  if (!error) return true;
  if (error.code !== "23505") throw error;

  // Recuperação defensiva de lock órfão após crash.
  const staleBefore = new Date(Date.now() - DB_CONVERSATION_LOCK_STALE_MS).toISOString();
  await supabaseAdmin
    .from("agent_generation_locks")
    .delete()
    .eq("conversation_id", conversationId)
    .lt("acquired_at", staleBefore);

  const { error: retryError } = await supabaseAdmin
    .from("agent_generation_locks")
    .insert({ conversation_id: conversationId, holder, acquired_at: new Date().toISOString() });

  if (!retryError) return true;
  if (retryError.code === "23505") return false;
  throw retryError;
}

async function releaseConversationDbLock(
  supabaseAdmin: any,
  conversationId: string,
  holder: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("agent_generation_locks")
    .delete()
    .eq("conversation_id", conversationId)
    .eq("holder", holder);
  if (error) console.error("[UAZ-WEBHOOK] Falha ao liberar lock persistente:", error);
}


// Deduplicação em memória por messageId. O TTL evita crescimento permanente do
// mapa e cobre as retransmissões normais do provedor. A proteção definitiva
// entre reinícios/instâncias é feita também pelo external_id persistido no banco.
const MESSAGE_ID_DEDUP_TTL_MS = 24 * 60 * 60 * 1000;
const seenMessageIds = new Map<string, number>();
function wasMessageIdRecentlySeen(id: string): boolean {
  const now = Date.now();
  const expiry = seenMessageIds.get(id);
  if (expiry && expiry > now) return true;

  if (expiry) seenMessageIds.delete(id);
  return false;
}

function markMessageIdSeen(id: string): void {
  const now = Date.now();
  seenMessageIds.set(id, now + MESSAGE_ID_DEDUP_TTL_MS);
  if (seenMessageIds.size > 1000) {
    for (const [key, value] of seenMessageIds) {
      if (value <= now) seenMessageIds.delete(key);
    }
  }
}

// Rastreamento de depuração do Welcome Funnel — grava um checkpoint no
// banco a cada ponto crítico de decisão. Fire-and-forget: nunca bloqueia
// nem quebra o fluxo principal, mesmo se o insert falhar. Existe pra
// diagnosticar exatamente onde uma mensagem específica parou, sem
// depender de acesso a log de servidor.
async function traceFunnel(
  supabaseAdmin: any,
  msgId: string,
  phone: string | undefined,
  step: string,
  details: Record<string, unknown>,
): Promise<void> {
  try {
    await (supabaseAdmin as any).from("funnel_debug_trace").insert({
      msg_id: msgId,
      phone: phone ?? null,
      step,
      details,
    });
  } catch (traceErr) {
    console.warn("[FUNNEL-TRACE] Falha ao gravar checkpoint (não bloqueia o fluxo):", traceErr);
  }
}

type UazapiPayload = {
  event?: string;
  EventType?: string;
  token?: string;
  instance?: { token?: string } | string;
  message?: {
    chatid?: string;
    sender?: string;
    sender_pn?: string;
    senderPn?: string;
    wa_chatid?: string;
    messageid?: string;
    messageId?: string;
    id?: string;
    key_id?: string;
    wa_messageid?: string;
    key?: { id?: string; senderPn?: string; cleanedSenderPn?: string; remoteJid?: string };
    fromMe?: boolean;
    fromme?: boolean;
    from_me?: boolean;
    type?: string;
    messageType?: string;
    text?: string;
    content?: string;
    mediaUrl?: string;
    mediaURL?: string;
    url?: string;
    fileURL?: string;
    fileUrl?: string;
    file?: string;
    base64?: string;
    data?: unknown;
    mimetype?: string;
    mediaType?: string;
    audioMessage?: unknown;
    pttMessage?: unknown;
    imageMessage?: unknown;
    stickerMessage?: unknown;
    caption?: string;
  };
  data?: UazapiPayload["message"];
};

type FromMeSource = "fromMe" | "fromme" | "from_me" | "default";

function normalizeFromMe(message: UazapiPayload["message"]): { fromMe: boolean; source: FromMeSource } {
  if (!message) return { fromMe: false, source: "default" };
  if (typeof message.fromMe === "boolean") return { fromMe: message.fromMe, source: "fromMe" };
  if (typeof message.fromme === "boolean") return { fromMe: message.fromme, source: "fromme" };
  if (typeof message.from_me === "boolean") return { fromMe: message.from_me, source: "from_me" };
  return { fromMe: false, source: "default" };
}

function pickInstanceToken(p: UazapiPayload): string | null {
  if (typeof p.token === "string" && p.token) return p.token;
  if (typeof p.instance === "string") return p.instance;
  if (p.instance && typeof p.instance === "object" && p.instance.token) return p.instance.token;
  return null;
}

function extractPhone(chatid?: string, sender?: string): string | null {
  const raw = (chatid ?? sender ?? "").split("@")[0];
  const digits = raw.replace(/\D+/g, "");
  return digits || null;
}

function extractUazapiSendTarget(message: UazapiPayload["message"]): string | null {
  if (!message) return null;
  const candidates = [
    message.sender_pn,
    message.senderPn,
    message.key?.cleanedSenderPn,
    message.key?.senderPn,
    message.wa_chatid,
    message.chatid,
    message.key?.remoteJid,
    message.sender,
  ];
  const target = candidates.find((value) =>
    typeof value === "string" && value.trim() && !/@(?:g\.us|broadcast|newsletter)$/i.test(value.trim()),
  );
  return typeof target === "string" ? target.trim() : null;
}

function findMediaReference(value: unknown, depth = 0): string | undefined {
  if (depth > 5 || value == null) return undefined;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (
      /^https?:\/\//i.test(trimmed) ||
      /^data:audio\//i.test(trimmed) ||
      (/^[A-Za-z0-9+/=\r\n]+$/.test(trimmed) && trimmed.length > 500)
    ) {
      return trimmed;
    }
    return undefined;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findMediaReference(item, depth + 1);
      if (found) return found;
    }
    return undefined;
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const preferredKeys = [
      "mediaUrl", "mediaURL", "fileURL", "fileUrl", "downloadUrl",
      "downloadURL", "url", "file", "base64", "data",
    ];
    for (const key of preferredKeys) {
      if (key in obj) {
        const found = findMediaReference(obj[key], depth + 1);
        if (found) return found;
      }
    }
    for (const nested of Object.values(obj)) {
      const found = findMediaReference(nested, depth + 1);
      if (found) return found;
    }
  }

  return undefined;
}

function extractContent(p: UazapiPayload): { text: string; kind: "texto" | "audio" | "image" | "sticker"; mime?: string; mediaUrl?: string } {
  const m = p.message ?? p.data ?? {};
  const type = (m.messageType ?? m.type ?? m.mediaType ?? "").toLowerCase();
  const mime = (m.mimetype ?? "").toLowerCase();
  
  const isAudio =
    type.includes("audio") ||
    type.includes("ptt") ||
    type.includes("voice") ||
    mime.startsWith("audio/") ||
    !!m.audioMessage ||
    !!m.pttMessage;

  if (isAudio) {
    const mediaUrl =
      m.mediaUrl ||
      m.mediaURL ||
      m.fileURL ||
      m.fileUrl ||
      m.url ||
      m.file ||
      m.base64 ||
      findMediaReference(m.audioMessage) ||
      findMediaReference(m.pttMessage) ||
      findMediaReference(m.data) ||
      findMediaReference(m);

    return {
      text: m.text || "[áudio recebido]",
      kind: "audio",
      mime,
      mediaUrl,
    };
  }

  const isSticker =
    type.includes("sticker") ||
    type.includes("figurinha") ||
    !!m.stickerMessage;
  if (isSticker) {
    const caption = (m.caption ?? m.text ?? m.content ?? "").trim();
    return { text: caption || "[figurinha recebida]", kind: "sticker", mime, mediaUrl: m.mediaUrl };
  }

  const isImage =
    type.includes("image") || type.includes("imagem") || mime.startsWith("image/") || !!m.imageMessage;
  if (isImage) {
    const caption = (m.caption ?? m.text ?? "").trim();
    return { text: caption || "[imagem recebida]", kind: "image", mime, mediaUrl: m.mediaUrl };
  }

  return { text: m.text ?? m.content ?? "", kind: "texto" };
}

function extractMessageId(p: UazapiPayload): string | null {
  const m = p.message ?? p.data ?? {};

  const candidates = [
    m.messageid,
    m.messageId,
    m.id,
    m.key_id,
    m.wa_messageid,
    m.key?.id,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

function buildFallbackMessageId(phone: string, content: string): string {
  const bucket = Math.floor(Date.now() / 10000); // 10s
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) - hash + content.charCodeAt(i)) | 0;
  }
  return `fb:${phone}:${bucket}:${(hash >>> 0).toString(36)}`;
}

const STOP_PATTERNS = [
  // "cancelar" sozinho é ambíguo: normalmente pode significar cancelar um pedido,
  // não retirar consentimento para mensagens. Só bloqueamos pedidos inequívocos.
  /^\s*(pare|parar|stop|unsubscribe)\s*[.!]?\s*$/i,
  /\bn[aã]o\s+quero\s+mais\s+(mensagens?|contato|receber)/i,
  /\bn[aã]o\s+me\s+(mande|manda|envie|mandar)\s+mais/i,
  /\bpare\s+de\s+(mandar|enviar)/i,
  /\bsai[ar]?\s+da\s+lista\b/i,
  /\bdescadastr/i,
  /\bme\s+tira\s+(daqui|da[ií]|da\s+lista|dos\s+contatos)/i,
];

export function isStopRequest(text: string): boolean {
  if (!text) return false;
  return STOP_PATTERNS.some((re) => re.test(text));
}

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
  // Mesma lógica de normalizeFunnelText (eram implementações idênticas
  // duplicadas) — delega em vez de repetir, sem mudar nenhum call site.
  return normalizeFunnelText(value);
}

async function detectCriticalHumanEscalation(params: {
  supabaseAdmin: any;
  conversationId?: string | null;
  currentText: string;
}): Promise<{ escalate: boolean; reason?: string }> {
  const { supabaseAdmin, conversationId, currentText } = params;

  let recentCustomerText = "";
  if (conversationId) {
    const { data, error } = await supabaseAdmin
      .from("messages")
      .select("body, created_at")
      .eq("conversation_id", conversationId)
      .eq("sender", "cliente")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.warn("[HUMAN-ESCALATION] Falha ao ler histórico recente:", error);
    } else {
      recentCustomerText = (data || [])
        .map((row: any) => String(row?.body || ""))
        .reverse()
        .join(" ");
    }
  }

  const current = normalizeEscalationText(currentText);
  const journey = normalizeEscalationText(`${recentCustomerText} ${currentText}`);

  // Risco jurídico/reputacional: humano imediatamente.
  const legalRisk =
    /\b(denuncia|denunciar|procon|advogad[oa]|processo|processar|acao judicial|justica|boletim de ocorrencia|policia|reclamacao formal|chargeback|contestacao do pagamento)\b/.test(journey);

  if (legalRisk) {
    return {
      escalate: true,
      reason: "risco de denúncia, contestação ou escalada jurídica",
    };
  }

  const supportUnavailable =
    /\b(nao consigo (?:abrir|acessar|falar com) (?:o )?suporte|sem acesso (?:ao|a) suporte|suporte (?:esta )?bloqueado|bloquead[oa].{0,45}suporte|nao tenho acesso ao suporte|nao da.{0,30}(?:ticket|suporte)|ticket.{0,30}(?:bloqueado|nao abre|nao funciona)|volta (?:a|para) pagina inicial)\b/.test(journey);

  const unresolvedSupport =
    /\b(nao resolvem|nao respondem|ninguem responde|ja reclamei|reclamei e|sem solucao|nao solucionaram|continuo com o problema)\b/.test(journey);

  const operationalProblem =
    /\b(pedido|id\s*:?\s*\d{5,}|seguidores?|plays?|ouvintes?|likes?|visualizacoes?|compra|saldo|credito|reposicao|garantia|caiu|perdi|parado|processando|nao chegou|nao recebi|faltam?|bloquead[oa]|restric|reembolso)\b/.test(journey);

  const severeLossOrBlock =
    /\b(perdi (?:quase )?todos|ficou (?:com )?menos de|me bloquearam|estou bloquead[oa]|conta bloqueada|restricao na conta)\b/.test(journey);

  // Não escalar uma dúvida simples de suporte. A combinação precisa demonstrar
  // que o canal normal não está disponível ou que já falhou.
  if (operationalProblem && supportUnavailable) {
    return {
      escalate: true,
      reason: "problema de pedido/conta com suporte inacessível",
    };
  }

  if (operationalProblem && unresolvedSupport && severeLossOrBlock) {
    return {
      escalate: true,
      reason: "reclamação crítica não resolvida",
    };
  }

  // O próprio turno já pode conter a combinação completa.
  const currentHasBlockedSupport =
    /\b(bloquead[oa]|sem acesso|nao consigo)\b/.test(current) &&
    /\b(suporte|ticket|reclam)\b/.test(current) &&
    operationalProblem;

  if (currentHasBlockedSupport) {
    return {
      escalate: true,
      reason: "cliente sem canal funcional para resolver suporte",
    };
  }

  // Venda já encaminhada, mas cadastro/recarga/pagamento está impedindo o fechamento.
  // Uma dúvida técnica simples continua com a Júlia; repetição/persistência vai ao setor responsável.
  const buyingJourney = /\b(compr|pagar|pagamento|pix|recarga|saldo|cadastro|cadastrar|pedido|1000|mil|r\$)\b/.test(journey);
  const technicalBlock = /\b(n[aã]o funciona|n[aã]o abre|n[aã]o aparece|n[aã]o completa|n[aã]o consigo|n[aã]o avan[çc]a|erro|trav|volta (?:a|para) p[aá]gina|pagamento n[aã]o aparece|saldo n[aã]o aparece|cadastro n[aã]o)\b/.test(journey);
  const troubleshootingLoop = (journey.match(/\b(cache|cookies?|outro navegador|ticket|tente novamente|atualiz|cadastro|pagamento)\b/g) || []).length >= 3;

  if (buyingJourney && technicalBlock && troubleshootingLoop) {
    return {
      escalate: true,
      reason: "venda bloqueada por problema técnico no cadastro/pagamento",
    };
  }

  return { escalate: false };
}

function shouldReplyWithAudio(params: {
  inputKind: "texto" | "audio" | "image" | "sticker";
  replyText: string;
  intent?: string;
  stage?: string;
}): boolean {
  if (params.inputKind !== "audio") return false;

  const text = String(params.replyText || "").trim();
  if (!text) return false;

  const sentenceCount = text
    .split(/[.!?]+/)
    .map((part) => part.trim())
    .filter(Boolean).length;

  const normalizedIntent = String(params.intent || "").toLowerCase();
  const normalizedStage = String(params.stage || "").toLowerCase();

  const complexIntent =
    normalizedIntent.includes("tecnico") ||
    normalizedIntent.includes("suporte") ||
    normalizedIntent.includes("tutorial") ||
    normalizedIntent.includes("explic") ||
    normalizedIntent.includes("duvida_complexa");

  const complexStage =
    normalizedStage.includes("suporte") ||
    normalizedStage.includes("resolucao") ||
    normalizedStage.includes("diagnostico");

  const hasStepByStepLanguage =
    /\b(passo a passo|primeiro|depois|em seguida|acesse|vá até|clique|selecione|configure)\b/i.test(text);

  // Regra híbrida:
  // - respostas simples continuam em texto;
  // - explicações realmente maiores/complexas viram nota de voz.
  return (
    text.length >= 260 ||
    sentenceCount >= 4 ||
    complexIntent ||
    complexStage ||
    (hasStepByStepLanguage && text.length >= 160)
  );
}

function isReactionOnlyMessage(value: string): boolean {
  const text = String(value || "").trim();
  if (!text) return false;

  // Emoji/reação curta: não gera resposta automática.
  const stripped = text
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D\s]+/gu, "")
    .trim();
  if (stripped.length === 0 && text.length <= 24) return true;

  // Confirmações que naturalmente podem encerrar um microtrecho.
  // Saudações (oi/bom dia/etc.) NÃO entram aqui.
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.!?,]+$/g, "")
    .trim();
  return new Set(["ok", "okay", "blz", "beleza", "entendi", "certo", "ta certo", "tá certo"]).has(normalized);
}

export function isHumanHandoffRequest(text: string): boolean {
  const normalized = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return false;
  return HUMAN_HANDOFF_PATTERNS.some((re) => re.test(normalized));
}

type WelcomeFunnelStep = {
  enabled?: boolean;
  text?: string;
  caption?: string;
  url?: string;
  delay_seconds?: number;
};

type WelcomeFunnelSteps = {
  welcome_text?: WelcomeFunnelStep;
  audio?: WelcomeFunnelStep;
  panel_text?: WelcomeFunnelStep;
  video?: WelcomeFunnelStep;
  services_text?: WelcomeFunnelStep;
};

type WelcomeFunnelRow = {
  id: string;
  name: string;
  delay_seconds: number;
  trigger_keywords: string;
  steps: WelcomeFunnelSteps | null;
  sort_order: number;
};

const WELCOME_FUNNEL_REPEAT_TEST_PHONES = new Set([
  "5511970116430",
]);

function normalizeFunnelPhone(value: string): string {
  return String(value || "").replace(/\D/g, "");
}

function canRepeatWelcomeFunnelForTest(phone: string): boolean {
  return WELCOME_FUNNEL_REPEAT_TEST_PHONES.has(normalizeFunnelPhone(phone));
}

// O funil não é cancelado por mensagens recebidas durante a sequência.
// Essas mensagens ficam registradas e o Agent V3 só é liberado após a conclusão.

function normalizeFunnelText(value: string): string {
  return normalizeTriggerText(value);
}

export function funnelMatchesMessage(triggerKeywords: string, message: string): boolean {
  const normalizedMessage = normalizeFunnelText(message);
  if (!normalizedMessage) return false;

  const genericGreetings = new Set(["oi", "ola", "bom dia", "boa tarde", "boa noite"]);
  const triggers = String(triggerKeywords || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  for (const rawTrigger of triggers) {
    const normalizedTrigger = normalizeFunnelText(rawTrigger);
    
    // Segurança: uma saudação genérica jamais pode disparar o funil sozinha.
    if (!normalizedTrigger || genericGreetings.has(normalizedTrigger)) continue;

    const isMatch = normalizedMessage === normalizedTrigger || normalizedMessage.includes(normalizedTrigger);

    // Telemetria para auditoria de disparo (logamos matches ou tentativas em mensagens que parecem gatilhos)
    const isPromising = message.toLowerCase().includes("interesse") || message.toLowerCase().includes("divulgar") || message.length > 20;
    
    if (isMatch || isPromising) {
      console.log(`[WELCOME-FUNNEL-AUDIT] ${isMatch ? "MATCH" : "NO MATCH"}`, {
        triggerOriginal: rawTrigger,
        triggerNormalizado: normalizedTrigger,
        mensagemOriginal: message,
        mensagemNormalizada: normalizedMessage,
        resultado: isMatch ? "MATCH" : "NO MATCH"
      });
    }

    if (isMatch) return true;
  }

  return false;
}

async function executeWelcomeFunnel(params: {
  supabaseAdmin: any;
  funnel: WelcomeFunnelRow;
  contactId: string;
  conversationId: string;
  userId: string;
  workspaceId: string;
  phone: string;
  creds: { uazapi_url: string; uazapi_token: string };
  resumeAfterStep?: string | null;
  initiatedBy?: "trigger" | "retry" | "resume";
}): Promise<void> {
  const { runWelcomeFunnelSequence } = await import(
    "@/lib/welcome-funnel-runner.server"
  );

  await runWelcomeFunnelSequence({
    supabase: params.supabaseAdmin,
    funnel: params.funnel,
    contactId: params.contactId,
    conversationId: params.conversationId,
    userId: params.userId,
    workspaceId: params.workspaceId,
    phone: params.phone,
    creds: params.creds,
    resumeAfterStep: params.resumeAfterStep,
    initiatedBy: params.initiatedBy ?? "trigger",
  });
}

async function processWebhook(payload: UazapiPayload): Promise<Response> {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const msgLocal = payload.message ?? payload.data ?? {};
    const { fromMe, source: fromMeSource } = normalizeFromMe(msgLocal);
    const phoneLocal = extractPhone(
      msgLocal.sender_pn ?? msgLocal.senderPn ?? msgLocal.key?.cleanedSenderPn ?? msgLocal.key?.senderPn ?? msgLocal.wa_chatid ?? msgLocal.chatid,
      msgLocal.sender,
    );
    const phoneStr = String(phoneLocal || "");
    const sendTarget = extractUazapiSendTarget(msgLocal) || phoneStr;
    console.log("[AUDIT] [SEND-TARGET-CHECK]", {
      phoneStr,
      sendTarget,
      match: sendTarget === phoneStr,
      rawCandidates: {
        sender_pn: msgLocal?.sender_pn,
        senderPn: msgLocal?.senderPn,
        cleanedSenderPn: msgLocal?.key?.cleanedSenderPn,
        keySenderPn: msgLocal?.key?.senderPn,
        wa_chatid: msgLocal?.wa_chatid,
        chatid: msgLocal?.chatid,
        remoteJid: msgLocal?.key?.remoteJid,
        sender: msgLocal?.sender,
      },
    });
    const instanceToken = pickInstanceToken(payload);

    if (!phoneStr) {
      return new Response("ok (no phone)");
    }

    // 0. SECURITY & RESOLUTION
    if (!instanceToken) {
      console.log("[UAZ-WEBHOOK] Rejected: missing instance token");
      return new Response("unauthorized (no instance token)", { status: 401 });
    }

    const { data: num } = await supabaseAdmin
      .from("whatsapp_numbers")
      .select("id, user_id, workspace_id, uazapi_url")
      .eq("uazapi_token", instanceToken)
      .maybeSingle();

    if (!num) {
      console.log("[UAZ-WEBHOOK] Rejected: instance token not provisioned");
      return new Response("unauthorized (unknown instance)", { status: 401 });
    }

    const content = extractContent(payload);

    // 1. Deduplicação por MessageID. Não marcamos o ID como concluído antes da
    // persistência: se houver uma falha transitória no CRM, o provedor precisa
    // conseguir retransmitir a mensagem em vez de ela ficar perdida por 24h.
    const extractedId = extractMessageId(payload);
    const fallbackIdentity = [content.kind, content.text, content.mediaUrl ?? ""].join(":");
    const msgId: string = extractedId ?? buildFallbackMessageId(phoneStr, fallbackIdentity);

    // IMPORTANTE (correção de regressão do Welcome Funnel, parte 2): esta
    // checagem em memória acontece ANTES até da criação do contato — mais
    // cedo que a correção anterior (duplicateMessageInDb). Se a 1ª tentativa
    // persistiu a mensagem/contato/conversa com sucesso e chamou
    // markMessageIdSeen, mas travou ou retornou em algum ponto ANTES de
    // chegar no Funnel Gate (seção 3.4/3.5), uma retransmissão do provedor
    // batia aqui e retornava imediatamente — nunca chegando nem perto da
    // correção anterior, porque essa é uma função só e o retorno aqui
    // interrompe tudo antes. Mesmo tratamento: vira flag, não retorno.
    // Contato/conversa são idempotentes (upsert), então é seguro deixar o
    // fluxo re-executar essa parte numa retransmissão.
    const isDuplicateInMemory = wasMessageIdRecentlySeen(msgId);
    if (isDuplicateInMemory) {
      console.log(`[UAZ-WEBHOOK] Duplicata em memória (msgId: ${msgId}) — seguindo mesmo assim pra dar chance ao Welcome Funnel.`);
    }

    // 2. CRM SYNC
    const traceId = generateTraceId();

    await logExecutionTrace({
      traceId,
      step: "pipeline_start",
      messageId: msgId,
      phone: phoneStr || undefined,
      details: {
        event: payload.event || payload.EventType,
        kind: content.kind,
        textPreview: content.text?.slice(0, 100),
        fromMe,
        fromMeSource
      }
    });

    // SYNC TO CRM (Always do this for all incoming messages)
    let contactId: string | undefined = undefined;
    let contactProfile: string | null = null;
    let contactTemperature: string | null = null;
    let contactSource: string | null = null;
    let conversationId: string | undefined = undefined;
    let duplicateMessageInDb = false;
    let messagePersistedInDb = false;
    let persistedMessageId: string | null = null;

    try {
      // Upsert Contact — NÃO inclui "source" no payload de propósito: se o
      // contato já existia (ex: criado por uma campanha de disparo com
      // source="disparo"), o upsert não sobrescreve esse valor, porque só
      // atualiza as colunas que estão explicitamente no objeto abaixo.
      // Isso preserva a origem do contato durante toda a vida dele.
      const { data: contact, error: contactErr } = await supabaseAdmin
        .from("contacts")
        .upsert({
          telefone: phoneStr,
          user_id: num.user_id,
          workspace_id: num.workspace_id,
          whatsapp_number_id: num.id,
          nome: msgLocal.sender?.split("@")[0] || phoneStr,
        }, { onConflict: "user_id,telefone" })
        .select("id, photo_url, perfil, temperatura, source")
        .single();

      if (contactErr) throw contactErr;
      if (contact?.id) contactId = contact.id;
      contactSource = contact?.source ?? null;
      contactProfile = contact?.perfil ?? null;
      contactTemperature = contact?.temperatura ?? null;

      // Hidrata a foto real do WhatsApp quando o contato ainda não possui uma.
      // O menu Conversas usa contacts.photo_url; sem este passo o avatar ficava
      // eternamente nas iniciais para contatos criados diretamente pelo webhook.
      if (contact?.id && !contact.photo_url && !fromMe) {
        try {
          const { uazapiGetProfilePic } = await import("@/lib/uazapi.server");
          const profilePic = await uazapiGetProfilePic(
            {
              uazapi_url: num.uazapi_url ?? "",
              uazapi_token: instanceToken,
            },
            phoneStr,
          );

          if (profilePic) {
            await supabaseAdmin
              .from("contacts")
              .update({ photo_url: profilePic })
              .eq("id", contact.id)
              .eq("workspace_id", num.workspace_id as string);
          }
        } catch (profilePicErr) {

          console.warn("[UAZ-WEBHOOK] Não foi possível atualizar foto do contato:", profilePicErr);
        }
      }

      // Resolve Conversation sem depender do nome exato de uma constraint UNIQUE.
      // Produção já passou por várias migrations (contact_id, user_id+contact_id,
      // índices parciais). Usar onConflict aqui pode derrubar TODAS as mensagens se
      // o schema real estiver um passo diferente do código.
      if (contactId) {
        const conversationPatch = {
          workspace_id: num.workspace_id as string,
          whatsapp_number_id: num.id,
          last_message_preview: content.text.slice(0, 100),
          last_message_at: new Date().toISOString(),
          status: (fromMe ? "agente_respondendo" : "aguardando") as any,
        };


        const { data: existingConv, error: existingConvErr } = await supabaseAdmin
          .from("conversations")
          .select("id")
          .eq("user_id", num.user_id)
          .eq("contact_id", contactId)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (existingConvErr) throw existingConvErr;

        if (existingConv?.id) {
          const { data: updatedConv, error: updateConvErr } = await supabaseAdmin
            .from("conversations")
            .update(conversationPatch)
            .eq("id", existingConv.id)
            .select("id")
            .single();

          if (updateConvErr) throw updateConvErr;
          conversationId = updatedConv.id;
        } else {
          const { data: insertedConv, error: insertConvErr } = await supabaseAdmin
            .from("conversations")
            .insert({
              contact_id: contactId,
              user_id: num.user_id,
              ...conversationPatch,
              // Não dependemos do default histórico do banco para novas conversas.
              agent_enabled: true,
            })
            .select("id")
            .single();

          if (insertConvErr) {
            // Corrida entre duas mensagens/instâncias: se outra criou primeiro,
            // buscamos a canônica em vez de perder o inbound.
            if (insertConvErr.code === "23505") {
              const { data: racedConv, error: racedConvErr } = await supabaseAdmin
                .from("conversations")
                .select("id")
                .eq("user_id", num.user_id)
                .eq("contact_id", contactId)
                .order("created_at", { ascending: true })
                .limit(1)
                .maybeSingle();

              if (racedConvErr || !racedConv?.id) throw racedConvErr || insertConvErr;

              const { error: racedUpdateErr } = await supabaseAdmin
                .from("conversations")
                .update(conversationPatch)
                .eq("id", racedConv.id);
              if (racedUpdateErr) throw racedUpdateErr;
              conversationId = racedConv.id;
            } else {
              throw insertConvErr;
            }
          } else if (insertedConv?.id) {
            conversationId = insertedConv.id;
          }
        }
      }

      // Insert Message
      if (!conversationId) {
        throw new Error("CRM sync não retornou conversationId");
      }

      // Map 'image' and 'sticker' to 'texto' since the enum only allows 'texto' and 'audio'
      const dbKind: "texto" | "audio" = content.kind === "audio" ? "audio" : "texto";

      const { data: persistedMessage, error: msgErr } = await supabaseAdmin
        .from("messages")
        .insert({
          conversation_id: conversationId,
          user_id: num.user_id,
          workspace_id: num.workspace_id,
          sender: fromMe ? "agente" : "cliente",
          kind: dbKind,
          body: content.text,
          audio_url: content.mediaUrl || undefined,
          external_id: msgId,
        }).select("id").single();

      if (msgErr) {
        if (msgErr.code === "23505") {
          duplicateMessageInDb = true;
          const { data: existingMessage, error: existingMessageErr } = await supabaseAdmin
            .from("messages")
            .select("id")
            .eq("external_id", msgId)
            .maybeSingle();
          if (existingMessageErr) throw existingMessageErr;
          persistedMessageId = existingMessage?.id ?? null;
        } else {
          throw msgErr;
        }
      } else {
        messagePersistedInDb = true;
        persistedMessageId = persistedMessage?.id ?? null;
      }
    } catch (syncErr: any) {
      console.error("[UAZ-WEBHOOK] Error syncing to CRM:", syncErr.message);
    }

    // Só considera o ID concluído depois que a sincronização terminou. Em caso
    // de indisponibilidade do banco, deixamos a retransmissão futura tentar de novo.
    if (messagePersistedInDb || duplicateMessageInDb) {
      markMessageIdSeen(msgId);
    }

    // Uma retransmissão recebida após restart ou em outra instância pode escapar
    // do mapa em memória. O external_id único no banco impede que ela gere uma
    // segunda resposta automática.
    //
    // IMPORTANTE (correção de regressão do Welcome Funnel): antes, uma mensagem
    // duplicada retornava aqui imediatamente, ANTES do Funnel Gate/Welcome
    // Funnel (seção 3.4/3.5) rodar. Isso significa que se o UAZAPI reenviasse
    // o mesmo evento (comportamento normal de retry de webhook) depois que a
    // mensagem já tivesse sido persistida na 1ª tentativa, o funil NUNCA
    // chegava a ser verificado em nenhuma das duas tentativas — mesmo com a
    // mensagem, contato e conversa corretamente salvos no banco. O Funnel Gate
    // e o Welcome Funnel já são idempotentes por design própria (tabela
    // welcome_funnel_runs + lock atômico em agent_generation_locks), então é
    // seguro deixá-los rodar aqui também — só a geração de resposta da IA
    // (mais abaixo) continua bloqueada em caso de duplicata, pra nunca mandar
    // 2 respostas pro cliente.
    const isDuplicateDelivery = duplicateMessageInDb;
    if (isDuplicateDelivery) {
      console.log(`[UAZ-WEBHOOK] [AUDIT] Mensagem duplicada (msgId ${msgId}) — Welcome Funnel continua idempotente; após os gates, ownership durável decide se o Agent V3 ainda precisa processar.`);
    }
    traceFunnel(supabaseAdmin, msgId, phoneStr, "dedup_check", {
      isDuplicateInMemory,
      isDuplicateDelivery,
      messagePersistedInDb,
    });

    // Nunca execute a IA quando a mensagem de entrada não foi persistida.
    // Caso o CRM esteja indisponível, responder mesmo assim cria dois riscos:
    // 1) o histórico fica diferente do que foi gravado no banco; e
    // 2) uma retransmissão do provedor pode gerar uma segunda resposta automática.
    // Retornamos 503 para permitir retry do provedor sem marcar o messageId como concluído.
    if (!messagePersistedInDb && !duplicateMessageInDb) {
      console.error(`[UAZ-WEBHOOK] CRM sync incompleto; adiando processamento do msgId ${msgId}`);
      console.log(`[UAZ-WEBHOOK] [AUDIT] RETORNO: retry (crm sync incomplete) para msgId ${msgId}`);
      return new Response("retry (crm sync incomplete)", { status: 503 });
    }

    // 3. AI GATE
    if (fromMe) {
      console.log(`[UAZ-WEBHOOK] [AUDIT] RETORNO: sync only for fromMe para msgId ${msgId}`);
      return new Response("ok (sync only for fromMe)");
    }

    const workspaceId = num.workspace_id?.trim();
    if (!workspaceId) {
      console.error("[UAZ-WEBHOOK] Número sem workspace_id; bloqueando Agent V3 para evitar vazamento entre workspaces", {
        userId: num.user_id,
        phone: phoneStr,
      });
      console.log(`[UAZ-WEBHOOK] [AUDIT] RETORNO: workspace configuration missing para msgId ${msgId}`);
      return new Response("workspace configuration missing", { status: 503 });
    }

    let customerMemory = null as any;
    let customerMemoryContext = "";

    if (contactId) {
      const {
        loadCustomerCommercialMemory,
        customerMemoryPromptContext,
      } = await import("@/lib/agent-v3/memory/customer-memory.server");

      customerMemory = await loadCustomerCommercialMemory({
        supabaseAdmin,
        workspaceId,
        contactId,
        contactTemperature,
        contactProfile,
      });
      customerMemoryContext = customerMemoryPromptContext(customerMemory);
    }

    // Mensagem textual recebida enquanto o funil estava em execução.
    // O webhook que iniciou o funil poderá retomá-la somente após a última etapa.
    let deferredFunnelMessage: string | null = null;

    // Reações simples não precisam consumir Claude nem gerar "qualquer coisa chama".
    // A mensagem continua salva no CRM, apenas não há resposta automática.
    if (content.kind === "texto" && isReactionOnlyMessage(content.text)) {
      console.log(`[UAZ-WEBHOOK] [AUDIT] RETORNO: reaction only para msgId ${msgId}`);
      return new Response("ok (reaction only)");
    }

    // DEBOUNCE DE MENSAGENS RÁPIDAS — V2, mais curto e monitorado.
    // Corrige o cliente mandando várias mensagens curtas em sequência
    // (comum no WhatsApp real) e cada uma disparando uma chamada de IA
    // independente, gerando respostas fragmentadas e se contradizendo
    // (achado em auditoria de conversa real, inclusive num caso de
    // cliente já irritado reclamando de entrega — pior cenário possível
    // pra receber mensagens confusas).
    //
    // V1 usava 6s e foi revertida por precaução (risco de timeout numa
    // plataforma serverless — Cloudflare Workers). Essa versão usa só
    // 1.5s: reduz bastante o risco de qualquer limite de tempo (da
    // plataforma ou do provedor do WhatsApp esperando resposta rápida),
    // e ainda pega a maioria das rajadas rápidas reais. Tem rastreamento
    // pra detectar na hora se algo sair errado, em vez de silêncio total
    // como aconteceu na V1.
    if (content.kind === "texto" && conversationId) {
      const DEBOUNCE_MS = 1500;
      const debounceStartedAt = new Date().toISOString();

      traceFunnel(supabaseAdmin, msgId, phoneStr, "debounce_v2_entrada", { debounceMs: DEBOUNCE_MS });

      await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_MS));

      const { data: newerMsgs, error: newerMsgsErr } = await (supabaseAdmin as any)
        .from("messages")
        .select("id, body, created_at")
        .eq("conversation_id", conversationId)
        .eq("sender", "cliente")
        .gt("created_at", debounceStartedAt)
        .order("created_at", { ascending: true });

      if (newerMsgsErr) {
        console.warn("[DEBOUNCE-V2] Falha ao checar mensagens mais novas (seguindo sem agrupar):", newerMsgsErr);
        traceFunnel(supabaseAdmin, msgId, phoneStr, "debounce_v2_erro", { error: String(newerMsgsErr) });
      } else if (newerMsgs && newerMsgs.length > 0) {
        console.log(`[DEBOUNCE-V2] msgId ${msgId} abortando — ${newerMsgs.length} mensagem(ns) mais nova(s) chegou(ram) durante a espera.`);
        traceFunnel(supabaseAdmin, msgId, phoneStr, "debounce_v2_abortado", { mensagensMaisNovas: newerMsgs.length });
        return new Response("ok (debounced v2, newer message will handle)");
      } else {
        const { data: burstMsgs } = await (supabaseAdmin as any)
          .from("messages")
          .select("body, created_at")
          .eq("conversation_id", conversationId)
          .eq("sender", "cliente")
          .gte("created_at", new Date(Date.now() - DEBOUNCE_MS - 1000).toISOString())
          .order("created_at", { ascending: true });

        if (burstMsgs && burstMsgs.length > 1) {
          const textoCombinado = (burstMsgs as any[]).map((m) => String(m.body || "").trim()).filter(Boolean).join("\n");
          if (textoCombinado) {
            console.log(`[DEBOUNCE-V2] msgId ${msgId} combinando ${burstMsgs.length} mensagens em uma só.`);
            traceFunnel(supabaseAdmin, msgId, phoneStr, "debounce_v2_combinado", { quantidade: burstMsgs.length });
            content.text = textoCombinado;
          }
        } else {
          traceFunnel(supabaseAdmin, msgId, phoneStr, "debounce_v2_seguiu_normal", {});
        }
      }
    }

    // 3.4. FUNNEL GATE GLOBAL
    // SIMPLIFICADO pra bater com o schema real da tabela (confirmado via
    // information_schema): welcome_funnel_runs só tem funnel_id, contact_id,
    // user_id, fired_at, workspace_id. Não existe status/updated_at/
    // completed_at — por isso o INSERT vinha falhando com PGRST204 desde
    // sempre, e o funil nunca completava. Como o funil roda síncrono
    // (start a finish numa chamada só, confirmado no código de
    // executeWelcomeFunnel), a mera EXISTÊNCIA de uma linha já significa
    // "esse contato já recebeu esse funil" — não precisa de estado.
    traceFunnel(supabaseAdmin, msgId, phoneStr, "funnel_gate_entry", {
      contactId: contactId ?? null,
      conversationId: conversationId ?? null,
      workspaceId,
    });
    if (contactId && conversationId) {
      console.log(`[UAZ-WEBHOOK] [AUDIT] Verificando gate global para ${phoneStr} (${contactId})`);
      const { data: runningFunnel, error: runningFunnelErr } = await (supabaseAdmin as any)
        .from("welcome_funnel_runs")
        .select("funnel_id, contact_id, fired_at")
        .eq("contact_id", contactId)
        .eq("workspace_id", workspaceId)
        .order("fired_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (runningFunnelErr) {
        console.warn("[WELCOME-FUNNEL] [AUDIT] Não foi possível verificar run em andamento:", runningFunnelErr);
        traceFunnel(supabaseAdmin, msgId, phoneStr, "funnel_gate_error", { error: String(runningFunnelErr) });
      } else if (runningFunnel) {
        // Já existe run pra esse contato — funil roda síncrono, então já
        // terminou. Não bloqueia, deixa o Agent V3 seguir normalmente.
        console.log(`[UAZ-WEBHOOK] [AUDIT] Gate global: LIBERANDO Agent V3 (run já existe, funil síncrono já concluiu)`);
        traceFunnel(supabaseAdmin, msgId, phoneStr, "funnel_gate_liberado", { reason: "existing_run_ja_concluido" });
      } else {
        console.log(`[UAZ-WEBHOOK] [AUDIT] Gate global: LIBERANDO Agent V3 (nenhuma run encontrada)`);
        traceFunnel(supabaseAdmin, msgId, phoneStr, "funnel_gate_liberado", { reason: "no_existing_run" });
      }
    } else {
      traceFunnel(supabaseAdmin, msgId, phoneStr, "funnel_gate_skipped", { reason: "contactId_ou_conversationId_ausente" });
    }


    // 3.5. WELCOME FUNNEL — independente do liga/desliga do Agent V3.
    // IMPORTANTE: primeiro verificamos se a mensagem realmente bate em um gatilho.
    // Mensagens comuns NÃO consultam welcome_funnel_runs e nunca ficam dependentes
    // de migrations novas do funil.
    // O gatilho vale para qualquer contato. Cliente antigo ou contato já marcado
    // como ativo também deve receber o funil se NUNCA recebeu aquele funil.
    // A tabela welcome_funnel_runs garante "uma vez por contato"; o número de teste
    // continua sendo a única exceção com repetição livre.
    if (
      contactId &&
      conversationId &&
      content.kind === "texto"
    ) {
      const normalizedMessage = normalizeTriggerText(content.text);
      console.log("====================================================");
      console.log("[WELCOME-FUNNEL-TRACE]");
      console.log("Mensagem original:", content.text);
      console.log("Mensagem normalizada:", normalizedMessage);
      console.log("Workspace:", workspaceId);
      console.log("WhatsApp Number:", num.id);
      console.log("User:", num.user_id);
      console.log("----------------------------------------------------");
      traceFunnel(supabaseAdmin, msgId, phoneStr, "welcome_funnel_entry", {
        mensagemOriginal: content.text,
        mensagemNormalizada: normalizedMessage,
        workspaceId,
        whatsappNumberId: num.id,
        userId: num.user_id,
      });

      const { data: funnelRows, error: funnelErr } = await (supabaseAdmin as any)
        .from("welcome_funnels")
        .select("id, name, delay_seconds, trigger_keywords, steps, sort_order, enabled")
        .eq("user_id", num.user_id)
        .eq("workspace_id", workspaceId)
        .eq("whatsapp_number_id", num.id)
        .eq("enabled", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (funnelErr) {
        // FAIL-OPEN: problema no subsistema do funil não pode derrubar o atendimento.
        console.error("[WELCOME-FUNNEL] Falha ao carregar funis; seguindo para Agent V3:", funnelErr);
        traceFunnel(supabaseAdmin, msgId, phoneStr, "funnels_query_error", { error: String(funnelErr) });
      } else {
        const rowCount = funnelRows?.length || 0;
        console.log("Funis carregados:");
        console.log("Quantidade:", rowCount);
        if (rowCount > 0) {
          (funnelRows as any[]).forEach(f => {
            console.log(`- id: ${f.id}`);
            console.log(`  nome: ${f.name}`);
            console.log(`  enabled: ${f.enabled}`);
            console.log(`  trigger original: "${f.trigger_keywords}"`);
            console.log(`  trigger normalizado: "${normalizeTriggerText(f.trigger_keywords)}"`);
          });
        }
        console.log("----------------------------------------------------");
        traceFunnel(supabaseAdmin, msgId, phoneStr, "funnels_loaded", {
          quantidade: rowCount,
          funis: (funnelRows as any[] || []).map(f => ({ id: f.id, nome: f.name, trigger: f.trigger_keywords })),
        });

        const matchingFunnel = ((funnelRows || []) as WelcomeFunnelRow[]).find((row) => {
          const isMatch = funnelMatchesMessage(row.trigger_keywords, content.text);
          const rowTriggerNorm = normalizeTriggerText(row.trigger_keywords);
          if (!isMatch) {
             // Silencioso no loop, reportamos o final
          }
          return isMatch;
        });

        console.log("Resultado do matching:", matchingFunnel ? "SIM" : "NÃO");
        if (!matchingFunnel && rowCount > 0) {
          console.log("Motivo da falha: Nenhuma correspondência exata entre mensagem normalizada e gatilhos normalizados.");
        }
        console.log("----------------------------------------------------");
        traceFunnel(supabaseAdmin, msgId, phoneStr, "matching_result", {
          matched: Boolean(matchingFunnel),
          matchingFunnelId: matchingFunnel?.id ?? null,
          matchingFunnelName: matchingFunnel?.name ?? null,
        });

        if (matchingFunnel) {

          // SIMPLIFICADO — mesmo motivo do Funnel Gate acima: a tabela real
          // só tem 5 colunas (funnel_id, contact_id, user_id, fired_at,
          // workspace_id). Sem status, não dá pra distinguir "falhou" de
          // "completou" — e como o funil roda síncrono, a existência da
          // linha JÁ significa que rodou (com sucesso ou não, mas rodou).
          // Retry automático de "failed" não é possível com esse schema.
          const { data: existingRun, error: existingRunErr } = await (supabaseAdmin as any)
            .from("welcome_funnel_runs")
            .select("funnel_id, contact_id, fired_at")
            .eq("funnel_id", matchingFunnel.id)
            .eq("contact_id", contactId)
            .maybeSingle();

          if (existingRunErr) {
            // FAIL-OPEN: melhor a Júlia responder do que silenciar todos os clientes.
            console.error("[WELCOME-FUNNEL] Falha ao verificar histórico; seguindo para Agent V3:", existingRunErr);
          } else {
            const repeatForTest = canRepeatWelcomeFunnelForTest(phoneStr);

            if (existingRun && !repeatForTest) {
              console.log("[WELCOME-FUNNEL] Run já existe pra esse contato; funil síncrono já concluiu, Agent V3 assume", {
                phone: phoneStr,
                funnelId: matchingFunnel.id,
              });
            }

            if (existingRun && repeatForTest) {
              // Número pessoal de teste pode repetir indefinidamente.
              const { error: deleteTestRunErr } = await (supabaseAdmin as any)
                .from("welcome_funnel_runs")
                .delete()
                .eq("funnel_id", matchingFunnel.id)
                .eq("contact_id", contactId);

              if (deleteTestRunErr) {
                console.error("[WELCOME-FUNNEL] Falha ao liberar repetição do número de teste; seguindo para Agent V3:", deleteTestRunErr);
              }
            }

            if (!existingRun || repeatForTest) {
              // Claim atômico baseado na PK original (funnel_id, contact_id).
              // Só as 5 colunas que realmente existem na tabela.
              console.log("Claim");
              console.log("claimWelcomeFunnel executou? SIM");
              const { error: claimErr } = await (supabaseAdmin as any)
                .from("welcome_funnel_runs")
                .insert({
                  funnel_id: matchingFunnel.id,
                  contact_id: contactId,
                  user_id: num.user_id,
                  workspace_id: workspaceId,
                  fired_at: new Date().toISOString(),
                });

              console.log("Resultado:", claimErr ? "erro" : "true");
              traceFunnel(supabaseAdmin, msgId, phoneStr, "claim_run_result", {
                sucesso: !claimErr,
                errorCode: claimErr?.code ?? null,
                errorMessage: claimErr?.message ?? null,
                funnelId: matchingFunnel.id,
              });


              if (claimErr) {
                if (claimErr.code === "23505") {
                  // Outra instância ganhou o claim. Não mande IA junto com o funil.
                  traceFunnel(supabaseAdmin, msgId, phoneStr, "claim_conflict", { funnelId: matchingFunnel.id });
                  return new Response("ok (welcome funnel claimed elsewhere)");
                }
                console.error("[WELCOME-FUNNEL] Falha ao reservar execução; seguindo para Agent V3:", claimErr);
              } else {
                // Usa o lock persistente já existente da conversa para impedir que
                // outra mensagem acorde a IA enquanto o funil está enviando.
                const funnelLockHolder = `funnel:${matchingFunnel.id}:${Date.now()}`;
                let funnelLockAcquired = false;
                try {
                  funnelLockAcquired = await acquireConversationDbLock(
                    supabaseAdmin,
                    conversationId,
                    funnelLockHolder,
                  );

                  if (!funnelLockAcquired) {
                    traceFunnel(supabaseAdmin, msgId, phoneStr, "lock_nao_adquirido", { funnelId: matchingFunnel.id });
                    await (supabaseAdmin as any)
                      .from("welcome_funnel_runs")
                      .delete()
                      .eq("funnel_id", matchingFunnel.id)
                      .eq("contact_id", contactId);
                    return new Response("ok (conversation busy)");
                  }
                  traceFunnel(supabaseAdmin, msgId, phoneStr, "lock_adquirido_enviando", { funnelId: matchingFunnel.id });

                  const creds = {
                    uazapi_url: num.uazapi_url ?? "",
                    uazapi_token: instanceToken,
                  };

                  console.log("Execução");
                  console.log("executeWelcomeFunnel executou? SIM");
                  await executeWelcomeFunnel({
                    supabaseAdmin,
                    funnel: matchingFunnel,
                    contactId,
                    conversationId,
                    userId: num.user_id,
                    workspaceId,
                    phone: sendTarget,
                    creds,
                  });

                  console.log("----------------------------------------------------");
                  console.log("Fluxo");
                  console.log("O código retornou após o funil? SIM");
                  console.log("executeAgent foi chamado? NÃO");
                  console.log("----------------------------------------------------");
                  console.log("Resultado Final");
                  console.log("FUNIL DISPARADO");
                  console.log("==============================");


                  // O runner compartilhado é a única fonte de verdade para
                  // status/progresso/completion do funil.
                  console.log(`[WELCOME-FUNNEL] Funil "${matchingFunnel.name}" concluído; Agent V3 liberado`);

                  // Se o cliente falou DURANTE o funil, a mensagem já foi salva por
                  // outro webhook que ficou bloqueado pelo status=running. Agora,
                  // somente após a última etapa, retomamos a mensagem mais recente.
                  const { data: queuedInbound } = await (supabaseAdmin as any)
                    .from("messages")
                    .select("body, kind, created_at")
                    .eq("conversation_id", conversationId)
                    .eq("sender", "cliente")
                    .gt("created_at", new Date(Date.now() - 15 * 60_000).toISOString())
                    .order("created_at", { ascending: false })
                    .limit(1)
                    .maybeSingle();

                  const queuedBody = String((queuedInbound as any)?.body || "").trim();
                  const originalTrigger = normalizeFunnelText(content.text);
                  if (
                    queuedBody &&
                    normalizeFunnelText(queuedBody) !== originalTrigger &&
                    (queuedInbound as any)?.kind === "texto"
                  ) {
                    console.log("[WELCOME-FUNNEL] Retomando mensagem que aguardou o funil:", {
                      phone: phoneStr,
                      chars: queuedBody.length,
                    });
                    deferredFunnelMessage = queuedBody;
                    // NÃO retorna: segue pelo runtime e chama Agent V3 agora, depois do funil.
                  } else {
                    return new Response("ok (welcome funnel completed)");
                  }
                } catch (funnelSendErr) {
                  console.error("[WELCOME-FUNNEL] Falha durante envio:", funnelSendErr);

                  // Pausa solicitada pelo painel é estado operacional, não falha.
                  if (
                    funnelSendErr instanceof Error &&
                    funnelSendErr.message === "WELCOME_FUNNEL_PAUSED"
                  ) {
                    console.log("[WELCOME-FUNNEL] Execução pausada pelo operador", {
                      funnelId: matchingFunnel.id,
                      contactId,
                    });
                    return new Response("ok (welcome funnel paused)");
                  }

                  const { markFunnelRunFailed } = await import(
                    "@/lib/welcome-funnel-runner.server"
                  );
                  await markFunnelRunFailed({
                    supabase: supabaseAdmin,
                    funnelId: matchingFunnel.id,
                    contactId,
                    userId: num.user_id,
                    workspaceId,
                    error: funnelSendErr,
                  });

                  // Mantém o run com status=failed para a Central do Funil mostrar
                  // o motivo e permitir reenvio exatamente do ponto que falhou.
                  if (conversationId) {
                    await supabaseAdmin
                      .from("conversations")
                      .update({
                        needs_review: true,
                        review_reason: "falha no funil de boas-vindas",
                      })
                      .eq("id", conversationId);
                  }

                  // Não derruba o WhatsApp inteiro: encerra somente o turno do gatilho.
                  return new Response("ok (welcome funnel failed; available for retry)");
                } finally {
                  if (funnelLockAcquired) {
                    await releaseConversationDbLock(
                      supabaseAdmin,
                      conversationId,
                      funnelLockHolder,
                    );
                  }
                }
              }
            }

            // existingRun normal = cliente já recebeu este funil; segue para Agent V3.
          }
        }
      }
    }


    // Duplicata do provedor não prova que o Agent V3 já processou a mensagem.
    // Depois de todos os gates de elegibilidade, o job durável é a fonte de
    // verdade: retry pode reparar o crash entre persistir messages e criar job.
    if (isDuplicateInMemory || isDuplicateDelivery) {
      console.log(`[UAZ-WEBHOOK] [AUDIT] Retry elegível seguirá até ownership durável: ${msgId}`);
    }

    // 4. AGENT GATES — aplicados DEPOIS do funil.
    // A chave global desliga/liga a IA em todas as conversas; a chave individual
    // permite exceção manual por conversa. O recebimento continua sincronizado no CRM.
    const { data: agentConfig, error: agentConfigErr } = await supabaseAdmin
      .from("agent_config")
      .select("agent_enabled")
      .eq("user_id", num.user_id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (agentConfigErr) {
      console.error("[UAZ-WEBHOOK] Failed to read global agent gate:", agentConfigErr);
      return new Response("ok (agent gate unavailable)");
    }

    // Sem registro ainda = comportamento padrão ON, igual ao painel.
    // Somente `agent_enabled = false` desliga explicitamente o master switch.
    if (agentConfig?.agent_enabled === false) {
      console.log(`[UAZ-WEBHOOK] [AUDIT] RETORNO: agent disabled globally para workspace ${workspaceId}`);
      return new Response("ok (agent disabled globally)");
    }

    if (conversationId) {
      const isAgentEnabled = await isConversationAgentEnabledV3(supabaseAdmin, conversationId);
      if (!isAgentEnabled) {
        console.log("RETURN-PONTO: agent-disabled", { phone: phoneStr });
        return new Response("ok (agent disabled for conversation)");
      }
    }

    // 5. AI PROCESSING (V3)
    const inboundStartedAt = Date.now();
    const lockKey = `${workspaceId}:${phoneStr}`;
    console.log(`[UAZ-WEBHOOK] Iniciando processamento para ${phoneStr} (Lock: ${lockKey})`);

    return await withConversationLock(lockKey, async () => {
      if (!persistedMessageId || !conversationId) {
        throw new Error("Agent V3 reached without persisted message/conversation id");
      }

      const lockHolder = `v3:${msgId}:${Date.now()}`;

      const ownershipResult = await beginWebhookAgentInboundRuntime(supabaseAdmin, {
        messageId: persistedMessageId,
        conversationId,
        workspaceId,
        sendTarget,
        inputText: deferredFunnelMessage || content.text || "",
        inputKind: content.kind,
        inputMime: content.mime,
        deferredFunnel: Boolean(deferredFunnelMessage),
        holder: lockHolder,
      });

      if (ownershipResult.status !== "claimed") {
        console.log("[UAZ-WEBHOOK] Agent inbound não entrou no runtime síncrono", {
          phone: phoneStr,
          messageId: persistedMessageId,
          status: ownershipResult.status,
        });
        return new Response(`ok (inbound ownership ${ownershipResult.status})`);
      }

      const runtimeOwnership = ownershipResult.ownership;
      let runtimeNeedsReview = false;
      let runtimeFailure: string | null = null;
      try {
          const runtimeResult = await executeAgentV3Runtime(supabaseAdmin, {
            source: "webhook",
            messageId: persistedMessageId,
            externalMessageId: msgId,
            conversationId,
            workspaceId,
            userId: num.user_id,
            whatsappNumberId: num.id,
            contactId,
            contactSource,
            phone: phoneStr,
            sendTarget,
            content: { ...content },
            deferredFunnelMessage,
            instance: {
              uazapiUrl: num.uazapi_url ?? "",
              uazapiToken: instanceToken,
            },
          });

          if (runtimeResult.class === "operational_attention") {
            runtimeNeedsReview = true;
            runtimeFailure = `Agent V3 operational attention: ${runtimeResult.reason}`;
            console.warn("[AGENT-INBOUND] runtime terminou com atenção operacional", {
              jobId: runtimeOwnership.jobId,
              reason: runtimeResult.reason,
            });
          }

          return new Response("ok (agent runtime — " + runtimeResult.reason + ")");
      } finally {
        // A mesma fronteira terminal usada pelo dispatcher resolve o job antes
        // de liberar a geração. Falha após entrada no runtime nunca volta para
        // pending/replay automático.
        try {
          await finishWebhookAgentInboundRuntime(
            supabaseAdmin,
            runtimeOwnership,
            runtimeNeedsReview
              ? { status: "needs_review", error: `Agent V3 critical error: ${runtimeFailure || "erro desconhecido"}` }
              : { status: "ok" },
          );
        } catch (ownershipFinalizeError) {
          console.error(
            "[UAZ-WEBHOOK] Falha ao finalizar ownership durável; mantendo estado seguro para recovery/review:",
            ownershipFinalizeError,
          );
        }
      }
    });
}

export const Route = createFileRoute("/api/public/hooks/uazapi-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        try {
          const payload = JSON.parse(rawBody) as UazapiPayload;
          return await processWebhook(payload);
        } catch (e) {
          return new Response("error", { status: 500 });
        }
      },
    },
  },
});
