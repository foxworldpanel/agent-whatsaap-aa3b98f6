import { createFileRoute } from "@tanstack/react-router";
import { sendAgentTextGuarded } from "@/lib/send-agent-guarded.server";
import { normalizeTriggerText, removeAccents } from "@/lib/text-normalize";
import { isConversationAgentEnabledV3 } from "@/lib/agent-v3/brain/config.server";
import { generateTraceId, logExecutionTrace } from "@/lib/agent-v3/telemetry/execution-tracer.server";

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


async function ensureAgentInboundJob(
  supabaseAdmin: any,
  messageId: string,
  conversationId: string,
  workspaceId: string,
  sendTarget: string,
  inputText: string,
  inputKind: "texto" | "audio" | "image" | "sticker",
  inputMime: string | undefined,
  deferredFunnel: boolean,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("agent_inbound_jobs")
    .insert({
      message_id: messageId,
      conversation_id: conversationId,
      workspace_id: workspaceId,
      send_target: sendTarget,
      input_text: inputText,
      input_kind: inputKind,
      input_mime: inputMime ?? null,
      deferred_funnel: deferredFunnel,
      status: "pending",
    });

  if (!error || error.code === "23505") return;
  throw error;
}

async function claimAgentInboundJob(
  supabaseAdmin: any,
  messageId: string,
  holder: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc(
    "claim_agent_inbound_job",
    {
      p_message_id: messageId,
      p_holder: holder,
    },
  );

  if (error) throw error;
  return data === true;
}

async function releaseAgentInboundJob(
  supabaseAdmin: any,
  messageId: string,
  holder: string,
  lastError?: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("agent_inbound_jobs")
    .update({
      status: "pending",
      claimed_by: null,
      claimed_at: null,
      last_error: lastError ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("message_id", messageId)
    .eq("status", "processing_safe")
    .eq("claimed_by", holder);

  if (error) throw error;
}

async function enterAgentInboundRuntime(
  supabaseAdmin: any,
  messageId: string,
  holder: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc("enter_agent_inbound_runtime", {
    p_message_id: messageId,
    p_holder: holder,
  });
  if (error) throw error;
  return data === true;
}

async function reviewAgentInboundJob(
  supabaseAdmin: any,
  messageId: string,
  holder: string,
  lastError: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("agent_inbound_jobs")
    .update({
      status: "needs_review",
      claimed_by: null,
      claimed_at: null,
      last_error: lastError.slice(0, 1000),
      updated_at: new Date().toISOString(),
    })
    .eq("message_id", messageId)
    .eq("status", "processing")
    .eq("claimed_by", holder);
  if (error) throw error;
}

async function completeAgentInboundJob(
  supabaseAdmin: any,
  messageId: string,
  holder: string,
): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("agent_inbound_jobs")
    .update({
      status: "processed",
      claimed_by: null,
      claimed_at: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("message_id", messageId)
    .eq("status", "processing")
    .eq("claimed_by", holder)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) {
    throw new Error(`Agent inbound job completion rejected for message ${messageId}`);
  }
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
      console.log(`[UAZ-WEBHOOK] [AUDIT] Mensagem duplicada (msgId ${msgId}) — pulando resposta da IA, mas ainda verificando Welcome Funnel (idempotente).`);
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


    // Bloqueio da resposta da IA pra mensagens duplicadas — o Welcome Funnel
    // já teve a chance de rodar acima (idempotente), agora sim replicamos o
    // comportamento original: nunca gerar uma 2ª resposta de IA pro cliente.
    if (isDuplicateInMemory || isDuplicateDelivery) {
      console.log(`[UAZ-WEBHOOK] [AUDIT] RETORNO: duplicate msgId (após checagem do funil): ${msgId}`);
      return new Response("ok (duplicate msgId, after funnel check)");
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

      await ensureAgentInboundJob(
        supabaseAdmin,
        persistedMessageId,
        conversationId,
        workspaceId,
        sendTarget,
        deferredFunnelMessage || content.text || "",
        content.kind,
        content.mime,
        Boolean(deferredFunnelMessage),
      );

      const jobClaimed = await claimAgentInboundJob(
        supabaseAdmin,
        persistedMessageId,
        lockHolder,
      );

      if (!jobClaimed) {
        console.log("[UAZ-WEBHOOK] Agent inbound job já possui outro owner", {
          phone: phoneStr,
          messageId: persistedMessageId,
        });
        return new Response("ok (inbound job already claimed)");
      }

      console.log(
        `[UAZ-WEBHOOK] [AUDIT] Tentando adquirir lock persistente no DB para conversa: ${conversationId}`,
      );

      let acquired: boolean;

      try {
        acquired = await acquireConversationDbLock(
          supabaseAdmin,
          conversationId,
          lockHolder,
        );
      } catch (lockError) {
        try {
          await releaseAgentInboundJob(
            supabaseAdmin,
            persistedMessageId,
            lockHolder,
            "conversation lock acquisition failed",
          );
        } catch (jobError) {
          console.error(
            "[UAZ-WEBHOOK] Falha ao devolver inbound job após erro de lock:",
            jobError,
          );
        }

        throw lockError;
      }

      if (!acquired) {
        await releaseAgentInboundJob(
          supabaseAdmin,
          persistedMessageId,
          lockHolder,
          "conversation busy",
        );

        console.log("RETURN-PONTO: conversation-busy-job-pending", {
          phone: phoneStr,
        });

        return new Response("ok (conversation busy; inbound job pending)");
      }

      console.log(
        `[UAZ-WEBHOOK] [AUDIT] Lock persistente adquirido para ${conversationId}`,
      );

      let enteredRuntime = false;
      try {
        enteredRuntime = await enterAgentInboundRuntime(
          supabaseAdmin,
          persistedMessageId,
          lockHolder,
        );
      } catch (runtimeClaimError) {
        await releaseConversationDbLock(supabaseAdmin, conversationId, lockHolder);
        try {
          await releaseAgentInboundJob(
            supabaseAdmin,
            persistedMessageId,
            lockHolder,
            "failed to enter Agent V3 runtime",
          );
        } catch (jobError) {
          console.error("[UAZ-WEBHOOK] Falha ao devolver inbound job antes do runtime:", jobError);
        }
        throw runtimeClaimError;
      }

      if (!enteredRuntime) {
        await releaseConversationDbLock(supabaseAdmin, conversationId, lockHolder);
        try {
          await releaseAgentInboundJob(
            supabaseAdmin,
            persistedMessageId,
            lockHolder,
            "runtime ownership transition rejected",
          );
        } catch (jobError) {
          console.error("[UAZ-WEBHOOK] Falha ao devolver inbound job sem ownership de runtime:", jobError);
        }
        return new Response("ok (inbound job ownership changed)");
      }

      let runtimeNeedsReview = false;
      try {
      const { data: integ, error: integErr } = await supabaseAdmin
        .from("integrations")
        .select("anthropic_api_key, openai_api_key, elevenlabs_api_key, elevenlabs_voice_id")
        .eq("user_id", num.user_id)
        .eq("workspace_id", workspaceId)
        .maybeSingle();

      if (integErr) {
        console.error("[UAZ-WEBHOOK] Failed to load AI integrations:", integErr);
        if (conversationId) {
          await supabaseAdmin
            .from("conversations")
            .update({
              needs_review: true,
              review_reason: "falha ao carregar integrações de IA",
            })
            .eq("id", conversationId)
            .then(({ error }) => {
              if (error) console.error("[UAZ-WEBHOOK] Failed to flag integration error for review:", error);
            });
        }
        return new Response("ok (AI integrations unavailable)");
      }

      const anthropicApiKey =
        integ?.anthropic_api_key?.trim() || process.env.ANTHROPIC_API_KEY?.trim() || "";
      const openaiApiKey =
        integ?.openai_api_key?.trim() || process.env.OPENAI_API_KEY?.trim() || "";
      const elevenlabsApiKey =
        integ?.elevenlabs_api_key?.trim() || process.env.ELEVENLABS_API_KEY?.trim() || "";
      const elevenlabsVoiceId =
        integ?.elevenlabs_voice_id?.trim() || process.env.ELEVENLABS_VOICE_ID?.trim() || "";

      const creds = { uazapi_url: num.uazapi_url ?? "", uazapi_token: instanceToken };

      let finalMsgText = deferredFunnelMessage || content.text || "";
      if (content.kind === "audio") {
        if (!openaiApiKey) {
          console.error("[AUDIO-V3] Whisper indisponível: OPENAI_API_KEY ausente");
          if (conversationId) {
            await supabaseAdmin
              .from("conversations")
              .update({
                needs_review: true,
                review_reason: "áudio recebido sem chave OpenAI para transcrição",
              })
              .eq("id", conversationId);
          }
          return new Response("ok (audio unavailable; flagged for review)");
        }

        try {
          console.log("[AUDIO-V3] 1/5 áudio inbound detectado", {
            msgId,
            mime: content.mime || null,
            webhookMediaUrl: !!content.mediaUrl,
          });

          // Caminho principal: a própria Uazapi baixa/descriptografa a mídia e
          // pede ao Whisper a transcrição. Isso evita depender de mediaUrl temporária
          // ou de campos diferentes entre versões do webhook.
          const { uazapiResolveInboundMedia } = await import("@/lib/uazapi.server");

          const downloaded = await uazapiResolveInboundMedia({
            creds,
            webhookMessageId: msgId,
            chatPhone: phoneStr,
            mediaKind: "audio",
            openaiApiKey,
          });

          const inboundAudioUrl =
            downloaded.fileURL?.trim() ||
            downloaded.fileData?.trim() ||
            content.mediaUrl?.trim() ||
            "";

          finalMsgText = downloaded.transcription?.trim() || "";

          console.log("[AUDIO-V3] /message/download concluído", {
            hasTranscription: !!finalMsgText,
            hasUrl: !!downloaded.fileURL,
            hasData: !!downloaded.fileData,
            mimetype: downloaded.mimetype,
          });

          // Fallback: se a Uazapi não retornou a transcrição, usamos nosso
          // processador Whisper diretamente com a mídia resolvida.
          if (!finalMsgText) {
            if (!inboundAudioUrl) {
              throw new Error(
                "Uazapi não retornou transcrição nem mídia utilizável para o áudio",
              );
            }

            const { processAudioV3 } = await import(
              "@/lib/agent-v3/integrations/audio-processor.server"
            );
            const transcription = await processAudioV3(
              inboundAudioUrl,
              openaiApiKey,
            );
            finalMsgText = transcription?.trim() || "";
          }

          if (!finalMsgText) {
            throw new Error("Whisper retornou transcrição vazia");
          }

          console.log("[AUDIO-V3] 2/5 Whisper concluído", {
            chars: finalMsgText.length,
          });

          // Se a Uazapi disponibilizou uma URL reproduzível, salva no CRM também.
          // Assim o player da conversa deixa de exibir 0:00 quando houver mídia pública.
          if (conversationId && downloaded.fileURL) {
            const { error: audioUrlPersistErr } = await supabaseAdmin
              .from("messages")
              .update({ audio_url: downloaded.fileURL })
              .eq("conversation_id", conversationId)
              .eq("external_id", msgId);

            if (audioUrlPersistErr) {
              console.warn(
                "[AUDIO-V3] Falha ao salvar URL reproduzível do áudio:",
                audioUrlPersistErr,
              );
            }
          }

          // A mensagem inbound foi persistida antes da transcrição para garantir
          // deduplicação. Agora substituímos "[áudio recebido]" pelo texto real
          // do Whisper para o CRM, histórico e tela de Conversas mostrarem o conteúdo.
          if (conversationId && finalMsgText) {
            const { error: transcriptPersistErr } = await supabaseAdmin
              .from("messages")
              .update({
                body: finalMsgText,
                kind: "audio",
              })
              .eq("conversation_id", conversationId)
              .eq("external_id", msgId);

            if (transcriptPersistErr) {
              console.error("[AUDIO-V3] Whisper funcionou, mas falhou ao salvar transcrição no CRM:", transcriptPersistErr);
            }

            const { error: previewPersistErr } = await supabaseAdmin
              .from("conversations")
              .update({
                last_message_preview: finalMsgText.slice(0, 120),
                last_message_at: new Date().toISOString(),
              })
              .eq("id", conversationId);

            if (previewPersistErr) {
              console.error("[AUDIO-V3] Falha ao atualizar preview transcrito:", previewPersistErr);
            }
          }
        } catch (audioErr) {
          console.error("[UAZ-WEBHOOK] Transcription failed:", audioErr);
          if (conversationId) {
            const { error: reviewErr } = await supabaseAdmin
              .from("conversations")
              .update({
                needs_review: true,
                review_reason: "falha ao transcrever áudio recebido",
              })
              .eq("id", conversationId);
            if (reviewErr) {
              console.error("[UAZ-WEBHOOK] Failed to flag transcription error for review:", reviewErr);
            }
          }
          return new Response("ok (audio transcription failed; flagged for review)");
        }
      }

      let resolvedImageSource:
        | { url?: string; data?: string; mediaType?: string }
        | undefined;

      if (content.kind === "image") {
        try {
          const { uazapiResolveInboundMedia } = await import("@/lib/uazapi.server");
          const image = await uazapiResolveInboundMedia({
            creds,
            webhookMessageId: msgId,
            chatPhone: phoneStr,
            mediaKind: "image",
          });

          const mime =
            image.mimetype?.includes("png") ? "image/png" :
            image.mimetype?.includes("gif") ? "image/gif" :
            image.mimetype?.includes("webp") ? "image/webp" :
            "image/jpeg";

          if (image.fileData) {
            const match = image.fileData.match(/^data:([^;,]+);base64,(.+)$/s);
            if (match) {
              resolvedImageSource = {
                data: match[2],
                mediaType: /^image\/(jpeg|png|gif|webp)$/i.test(match[1])
                  ? match[1].toLowerCase()
                  : mime,
              };
            }
          }

          if (!resolvedImageSource && image.fileURL) {
            const response = await fetch(image.fileURL);
            if (response.ok) {
              const bytes = Buffer.from(await response.arrayBuffer());
              if (bytes.length > 0) {
                const responseMime =
                  response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ||
                  mime;
                resolvedImageSource = {
                  data: bytes.toString("base64"),
                  mediaType: /^image\/(jpeg|png|gif|webp)$/i.test(responseMime)
                    ? responseMime
                    : mime,
                };
              }
            }
          }

          if (!resolvedImageSource) {
            throw new Error("Imagem resolvida pela Uazapi, mas sem bytes utilizáveis");
          }

          finalMsgText =
            content.text && content.text !== "[imagem recebida]"
              ? content.text
              : "Analise a imagem enviada e responda de acordo com o contexto da conversa.";

          console.log("[IMAGE-V3] imagem pronta para Claude Vision", {
            messageId: image.messageId,
            mediaType: resolvedImageSource.mediaType,
          });
        } catch (imageError) {
          console.error("[IMAGE-V3] Falha ao resolver imagem:", imageError);
          if (conversationId) {
            await supabaseAdmin
              .from("conversations")
              .update({
                needs_review: true,
                review_reason: "falha ao carregar imagem para análise visual",
              })
              .eq("id", conversationId);
          }
          return new Response("ok (image unavailable; flagged for review)");
        }
      }

      if (!finalMsgText.trim()) {
        return new Response("ok (empty content)");
      }


      const criticalEscalation = await detectCriticalHumanEscalation({
        supabaseAdmin,
        conversationId,
        currentText: finalMsgText,
      });

      if (criticalEscalation.escalate) {
        const nowIso = new Date().toISOString();
        const handoffReply =
          "Entendi. Como seu caso precisa de uma análise mais detalhada, vou pausar por aqui e encaminhar para o setor responsável. Assim que possível, a equipe dará continuidade ao seu atendimento.";

        try {
          if (conversationId) {
            const { error: criticalConvErr } = await supabaseAdmin
              .from("conversations")
              .update({
                agent_enabled: false,
                needs_review: true,
                review_reason: criticalEscalation.reason || "suporte humano necessário",
                auto_paused_at: nowIso,
                status: "aguardando",
                internal_note:
                  `Escalação automática para humano. Motivo: ${criticalEscalation.reason || "caso crítico de suporte"}.`,
              })
              .eq("id", conversationId);

            if (criticalConvErr) throw criticalConvErr;
          }

          // Mantém o Lead Intelligence coerente com o handoff crítico.
          await supabaseAdmin.from("agent_logs").insert({
            user_id: num.user_id,
            workspace_id: workspaceId,
            phone: phoneStr,
            conversation_id: conversationId,
            type: "agent_v3_turn",
            level: "warning",
            summary: "Agent V3 escalou caso crítico para revisão humana",
            response: handoffReply,
            metadata: {
              human_escalation: true,
              escalation_reason: criticalEscalation.reason,
              intelligence: {
                temperature: "frio",
                confidence: "Muito alta",
                intent: "Reclamação",
                stage: "Pós-venda",
                purchase_probability: 20,
                sentiment: "Negativo",
                urgency: "Alta",
                recommended_action: "Atendimento humano obrigatório antes de novas tentativas automáticas.",
                reasoning: criticalEscalation.reason || "Caso crítico de suporte.",
              },
            },
          }).then(({ error }: any) => {
            if (error) console.warn("[HUMAN-ESCALATION] Falha ao salvar inteligência:", error);
          });

          const sendResult = await sendAgentTextGuarded(
            creds,
            sendTarget,
            handoffReply,
            {
              conversationId: conversationId as string,
              source: "critical_human_escalation",
            },
          );


          if (conversationId) {
            const { error: persistErr } = await supabaseAdmin
              .from("messages")
              .insert({
                conversation_id: conversationId,
                user_id: num.user_id,
                workspace_id: workspaceId,
                sender: "agente",
                kind: "texto",
                body: sendResult.transformed,
              });

            if (persistErr) {
              console.error("[HUMAN-ESCALATION] Handoff enviado, mas falhou ao persistir:", persistErr);
            }
          }

          const { clearConversationStateV3 } = await import(
            "@/lib/agent-v3/memory/conversation-state.server"
          );
          await clearConversationStateV3(
            num.user_id,
            phoneStr,
            workspaceId,
          ).catch((error) => {
            console.warn("[HUMAN-ESCALATION] Falha ao limpar memória V3:", error);
          });

          console.warn("[HUMAN-ESCALATION] Atendimento automático pausado", {
            conversationId,
            phone: phoneStr,
            reason: criticalEscalation.reason,
          });

          return new Response("ok (critical human escalation)");
        } catch (criticalErr) {
          console.error("[HUMAN-ESCALATION] Falha ao escalar conversa:", criticalErr);
          return new Response("ok (critical escalation failed)");
        }
      }

      if (isHumanHandoffRequest(finalMsgText)) {
        const handoffReply =
          "Claro. Vou pausar por aqui e encaminhar seu atendimento para o setor responsável. Assim que possível, a equipe dará continuidade por aqui.";

        try {
          if (conversationId) {
            const { error: handoffConvErr } = await supabaseAdmin
              .from("conversations")
              .update({
                agent_enabled: false,
                needs_review: true,
                review_reason: "cliente solicitou atendimento humano",
                auto_paused_at: new Date().toISOString(),
                status: "aguardando",
                internal_note:
                  "Cliente solicitou atendimento humano pelo WhatsApp. Agent V3 pausado até reativação manual.",
              })
              .eq("id", conversationId);

            if (handoffConvErr) throw handoffConvErr;
          }

          // Confirma UMA vez e encerra o turno. Depois disso agent_enabled=false
          // impede novas respostas automáticas até reativação manual no painel.
          const sendResult = await sendAgentTextGuarded(
            creds,
            sendTarget,
            handoffReply,
            {
              conversationId: conversationId as string,
              source: "human_handoff",
            },
          );


          if (conversationId) {
            const { error: handoffMessageErr } = await supabaseAdmin
              .from("messages")
              .insert({
                conversation_id: conversationId,
                user_id: num.user_id,
                workspace_id: workspaceId,
                sender: "agente",
                kind: "texto",
                body: sendResult.transformed,
              });

            if (handoffMessageErr) {
              console.error(
                "[HUMAN-HANDOFF] Confirmação enviada, mas falhou ao persistir:",
                handoffMessageErr,
              );
            }
          }

          // Limpa a memória operacional do Agent V3. Quando o operador decidir
          // reativar a conversa, o agente não retoma um estado comercial antigo.
          const { clearConversationStateV3 } = await import(
            "@/lib/agent-v3/memory/conversation-state.server"
          );
          await clearConversationStateV3(
            num.user_id,
            phoneStr,
            workspaceId,
          ).catch((error) => {
            console.warn("[HUMAN-HANDOFF] Falha ao limpar memória V3:", error);
          });

          console.log("[HUMAN-HANDOFF] Agent V3 pausado para atendimento humano", {
            conversationId,
            phone: phoneStr,
          });

          return new Response("ok (human handoff)");
        } catch (handoffErr) {
          console.error("[HUMAN-HANDOFF] Falha no handoff:", handoffErr);
          return new Response("ok (human handoff failed)");
        }
      }

      if (isStopRequest(finalMsgText)) {
        const nowIso = new Date().toISOString();
        const persistenceTasks: PromiseLike<unknown>[] = [];

        if (conversationId) {
          persistenceTasks.push(
            supabaseAdmin
              .from("conversations")
              .update({
                agent_enabled: false,
                needs_review: true,
                review_reason: "opt-out solicitado pelo contato",
                auto_paused_at: nowIso,
                internal_note: "Contato pediu para não receber novas mensagens automáticas.",
              })
              .eq("id", conversationId),
          );
        }

        if (contactId) {
          persistenceTasks.push(
            supabaseAdmin
              .from("contacts")
              .update({
                status: "bloqueado",
                temperatura: "bloqueado",
                temperatura_updated_at: nowIso,
              })
              .eq("id", contactId),
          );
        }

        const stopResults = await Promise.all(persistenceTasks);
        for (const result of stopResults) {
          const error = (result as { error?: unknown }).error;
          if (error) console.error("[UAZ-WEBHOOK] Failed to persist stop request:", error);
        }

        const { clearConversationStateV3 } = await import("@/lib/agent-v3/memory/conversation-state.server");
        await clearConversationStateV3(
          num.user_id,
          phoneStr,
          workspaceId,
        ).catch((error) => {
          console.error("[UAZ-WEBHOOK] Failed to clear V3 state after stop request:", error);
        });

        return new Response("ok (stop request persisted)");
      }

      const { getConversationStateV3, saveConversationStateV3 } = await import("@/lib/agent-v3/memory/conversation-state.server");
      const {
        DEFAULT_AGENT_HUMANIZATION,
        normalizeHumanizationSettings,
        calculateHumanResponseTargetMs,
        calculatePartDelayMs,
        sleepMs,
      } = await import("@/lib/agent-v3/humanization.server");

      const { data: humanizationConfigRow, error: humanizationError } = await (supabaseAdmin as any)
        .from("agent_config")
        .select("modules, response_delay_min_sec, response_delay_max_sec, typing_indicator_enabled")
        .eq("user_id", num.user_id)
        .eq("workspace_id", workspaceId)
        .maybeSingle();

      if (humanizationError) {
        console.warn("[UAZ-WEBHOOK] Falha ao carregar configuração de humanização; usando padrão:", humanizationError);
      }

      const legacyModules =
        humanizationConfigRow?.modules &&
        typeof humanizationConfigRow.modules === "object"
          ? humanizationConfigRow.modules
          : {};

      const storedHumanization =
        (legacyModules as any)?.__humanization_settings;

      const humanization = normalizeHumanizationSettings(
        storedHumanization && typeof storedHumanization === "object"
          ? storedHumanization
          : {
              ...DEFAULT_AGENT_HUMANIZATION,
              min_response_delay_ms:
                Number.isFinite(Number(humanizationConfigRow?.response_delay_min_sec))
                  ? Number(humanizationConfigRow.response_delay_min_sec) * 1000
                  : DEFAULT_AGENT_HUMANIZATION.min_response_delay_ms,
              max_response_delay_ms:
                Number.isFinite(Number(humanizationConfigRow?.response_delay_max_sec))
                  ? Number(humanizationConfigRow.response_delay_max_sec) * 1000
                  : DEFAULT_AGENT_HUMANIZATION.max_response_delay_ms,
              typing_enabled:
                typeof humanizationConfigRow?.typing_indicator_enabled === "boolean"
                  ? humanizationConfigRow.typing_indicator_enabled
                  : DEFAULT_AGENT_HUMANIZATION.typing_enabled,
            },
      );
      // Enquanto o modelo prepara uma resposta em texto, já exibimos "digitando...".
      // A espera final considera o tempo já gasto pelo processamento para não deixar
      // o atendimento artificialmente lento.
      if (
        humanization.enabled &&
        humanization.typing_enabled &&
        content.kind !== "audio"
      ) {
        const { uazapiSendTyping } = await import("@/lib/uazapi.server");
        await uazapiSendTyping(
          creds,
          sendTarget,
          humanization.max_response_delay_ms,
        ).catch((error) => {
          console.warn("[UAZ-WEBHOOK] Não foi possível sinalizar digitando:", error);
        });
      }

      console.log(`[UAZ-WEBHOOK] [AUDIT] Recuperando estado da conversa para ${phoneStr}`);
      const { history, telemetry: historyTelemetry } = await getConversationStateV3(
        num.user_id,
        phoneStr,
        workspaceId,
      );
      console.log(`[UAZ-WEBHOOK] [AUDIT] Histórico recuperado: ${history?.length || 0} mensagens. Telemetria: ${JSON.stringify(historyTelemetry || {})}`);

      // O histórico V3 não contém necessariamente as peças automáticas do funil.
      // Consulte o runtime do funil para impedir uma segunda apresentação da Júlia.
      // SIMPLIFICADO: sem coluna status na tabela real, existência da linha
      // já significa "esse funil já rodou pra esse contato" (síncrono).
      let funnelAlreadyCompleted = false;
      if (contactId) {
        const { data: completedFunnelRun } = await (supabaseAdmin as any)
          .from("welcome_funnel_runs")
          .select("funnel_id")
          .eq("contact_id", contactId)
          .eq("workspace_id", workspaceId)
          .limit(1)
          .maybeSingle();
        funnelAlreadyCompleted = Boolean(completedFunnelRun);
      }
      // Diagnóstico real — achado em conversa de produção em 10/08/2026
      // onde a Júlia cumprimentou de novo mesmo com o funil já concluído
      // (violando a regra PÓS-FUNIL). O código de cálculo parece correto
      // lendo, então isso registra o valor real computado toda vez, pra
      // confirmar com dado se é timing/corrida ou outra causa, em vez de
      // suposição.
      traceFunnel(supabaseAdmin, msgId, phoneStr, "funnel_already_completed_check", {
        contactId: contactId ?? null,
        workspaceId,
        funnelAlreadyCompleted,
      });

      // Agrupa rajadas curtas do mesmo cliente (ex.: "Inscritos" + "E comentário").
      // Isso evita responder à primeira metade como se ela fosse a intenção completa.
      let effectiveAgentMessage = finalMsgText;
      if (conversationId && content.kind === "texto") {
        const burstSince = new Date(Date.now() - 12_000).toISOString();
        const { data: burstRows } = await supabaseAdmin
          .from("messages")
          .select("body, created_at")
          .eq("conversation_id", conversationId)
          .eq("sender", "cliente")
          .gte("created_at", burstSince)
          .order("created_at", { ascending: true })
          .limit(4);

        const burstBodies = (burstRows || [])
          .map((row: any) => String(row?.body || "").trim())
          .filter(Boolean);
        if (burstBodies.length > 1) {
          effectiveAgentMessage = burstBodies.join("\n");
        }
      }

      // ============================================================
      // SMART ROUTER — agora encapsulado dentro de executeAgent(), junto
      // com a chamada condicional ao Claude. Ver o bloco logo abaixo,
      // próximo de "RETURN-PONTO: chegou na V3". Mantido aqui como
      // comentário histórico: antes disso, o webhook tinha sua própria
      // cópia dessa checagem — unificado agora pra Playground e WhatsApp
      // usarem exatamente o mesmo ponto de decisão.
      // ============================================================

      const {
        deriveBusinessDecisionV3,
        businessDecisionToPromptV3,
        enrichBusinessDecisionV3,
        reconcileBusinessDecisionV3,
      } = await import("@/lib/agent-v3/brain/business-state.server");

      let previousBusinessDecision: any = null;
      if (conversationId) {
        const { loadSingleBusinessStateV3 } = await import(
          "@/lib/agent-v3/memory/business-state-memory.server"
        );
        previousBusinessDecision = await loadSingleBusinessStateV3({
          supabaseAdmin,
          workspaceId,
          conversationId,
        });
      }

      const derivedBusinessDecision = enrichBusinessDecisionV3(deriveBusinessDecisionV3({
        message: effectiveAgentMessage,
        recentCustomerMessages: history
          .filter((item) => item.role === "customer")
          .slice(-6)
          .map((item) => item.content),
        customerLifecycle: customerMemory?.lifecycle ?? null,
      }), effectiveAgentMessage);

      const businessDecision = reconcileBusinessDecisionV3({
        previous: previousBusinessDecision,
        current: derivedBusinessDecision,
        message: effectiveAgentMessage,
      });

      // ============================================================
      // MODO SOMBRA — buildAgentExecutionContext() rodando em paralelo,
      // só pra comparação. NÃO influencia a resposta real, que continua
      // vindo 100% do pipeline antigo acima. Qualquer erro aqui é só
      // logado, nunca interrompe o atendimento.
      // ============================================================
      try {
        const { buildAgentExecutionContext } = await import(
          "@/lib/agent-v3/core/agent-execution-context.server"
        );
        const shadowContext = buildAgentExecutionContext({
          mode: "whatsapp",
          message: effectiveAgentMessage,
          history: history.map((h) => ({ role: h.role, content: h.content })),
          customerLifecycle: customerMemory?.lifecycle ?? null,
          previousBusinessDecision,
          rememberedContext: {
            platform: customerMemory?.preferredPlatform ?? null,
            product: customerMemory?.preferredProduct ?? null,
          },
        });

        const oldExtraContext = [
          customerMemoryContext,
          businessDecisionToPromptV3(businessDecision),
        ].filter(Boolean).join("\n\n") || undefined;

        const diffs: string[] = [];

        if (shadowContext.businessDecision.state !== businessDecision.state) {
          diffs.push(
            `BusinessDecision.state: antigo="${businessDecision.state}" novo="${shadowContext.businessDecision.state}"`,
          );
        }
        if (shadowContext.businessDecision.nextAction !== businessDecision.nextAction) {
          diffs.push(
            `BusinessDecision.nextAction: antigo="${businessDecision.nextAction}" novo="${shadowContext.businessDecision.nextAction}"`,
          );
        }
        if (shadowContext.businessDecision.risk !== businessDecision.risk) {
          diffs.push(
            `BusinessDecision.risk: antigo="${businessDecision.risk}" novo="${shadowContext.businessDecision.risk}"`,
          );
        }
        // extraContext é comparado por tamanho E por hash — hash detecta
        // qualquer diferença de conteúdo, mesmo que o tamanho bata por
        // coincidência.
        const oldExtraContextChars = (oldExtraContext || "").length;
        const newExtraContextChars = (shadowContext.extraContext || "").length;
        const extraContextCharsDiff = newExtraContextChars - oldExtraContextChars;
        if (Math.abs(extraContextCharsDiff) > 50) {
          diffs.push(
            `extraContext.length: antigo=${oldExtraContextChars} novo=${newExtraContextChars} (diferença: ${extraContextCharsDiff > 0 ? "+" : ""}${extraContextCharsDiff} chars)`,
          );
        }

        const { createHash } = await import("node:crypto");
        const hashOf = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);
        const oldExtraContextHash = hashOf(oldExtraContext || "");
        const newExtraContextHash = hashOf(shadowContext.extraContext || "");
        const extraContextHashMatches = oldExtraContextHash === newExtraContextHash;
        if (!extraContextHashMatches && !diffs.some(d => d.startsWith("extraContext"))) {
          // Tamanho bateu mas conteúdo é diferente — hash pegou o que o
          // tamanho sozinho não pegaria.
          diffs.push(`extraContext.hash: antigo=${oldExtraContextHash} novo=${newExtraContextHash} (conteúdo diferente apesar do tamanho parecido)`);
        }

        // Nota percentual: cada checagem vale igual, simples e transparente.
        const checks = [
          { name: "BusinessDecision.state", ok: !diffs.some(d => d.startsWith("BusinessDecision.state")) },
          { name: "BusinessDecision.nextAction", ok: !diffs.some(d => d.startsWith("BusinessDecision.nextAction")) },
          { name: "BusinessDecision.risk", ok: !diffs.some(d => d.startsWith("BusinessDecision.risk")) },
          { name: "extraContext", ok: extraContextHashMatches },
        ];
        const score = Math.round((checks.filter(c => c.ok).length / checks.length) * 1000) / 10;
        const allEqual = checks.every(c => c.ok);

        console.log(`
=============================
PARIDADE (modo sombra — não afeta a resposta)
=============================
${checks.map(c => `${c.name}: ${c.ok ? "✓ Igual" : "✗ Diferente"}`).join("\n")}
-----------------------------
PARIDADE: ${score}%
=============================
${diffs.length > 0 ? "DETALHES DAS DIVERGÊNCIAS:\n" + diffs.join("\n") : "Nenhuma divergência encontrada."}
=============================`);

        // Persiste pra consulta posterior (SELECT * WHERE equal = false).
        // Best-effort — falha aqui não afeta nada.
        await (supabaseAdmin as any).from("agent_parity_runs").insert({
          workspace_id: workspaceId,
          phone: phoneStr,
          conversation_id: conversationId ?? null,
          equal: allEqual,
          score,
          differences: diffs,
          old_snapshot: {
            state: businessDecision.state,
            nextAction: businessDecision.nextAction,
            risk: businessDecision.risk,
            extraContextHash: oldExtraContextHash,
            extraContextChars: oldExtraContextChars,
          },
          new_snapshot: {
            state: shadowContext.businessDecision.state,
            nextAction: shadowContext.businessDecision.nextAction,
            risk: shadowContext.businessDecision.risk,
            extraContextHash: newExtraContextHash,
            extraContextChars: newExtraContextChars,
          },
        } as any);
      } catch (shadowModeError) {
        console.warn("[PARIDADE] Falha no modo sombra (não bloqueia o fluxo):", shadowModeError);
      }

      console.log("[BUSINESS-STATE-V3] decisão antes do LLM", {
        conversationId,
        state: businessDecision.state,
        risk: businessDecision.risk,
        reason: businessDecision.reason,
        nextAction: businessDecision.nextAction,
      });

      const { shouldStaySilentForNaturalConversation } = await import(
        "@/lib/agent-v3/brain/guards.server"
      );
      const naturalSilence = shouldStaySilentForNaturalConversation({
        message: effectiveAgentMessage,
        history: history.map((item) => ({
          sender: item.role === "agent" ? "agente" : "cliente",
          body: item.content,
        })),
      });

      if (content.kind === "texto" && naturalSilence) {
        console.log(`[UAZ-WEBHOOK] [AUDIT] RETORNO: natural conversational silence para conversa ${conversationId}`);
        return new Response("ok (natural conversational silence)");
      }

      // ============================================================
      // FLOW ENGINE — checagem ANTECIPADA (antes da IA), só pra
      // permitir que uma FlowAction ligada por feature flag influencie
      // a resposta. Enquanto NENHUMA flag estiver ligada (estado atual),
      // "anyFlowActionEnabled()" é false e nada além dessa checagem
      // síncrona acontece — zero custo extra, zero leitura de banco.
      // ============================================================
      let flowActionHint: { version: number; action: string; reasonCode: string; reason: string; payload: unknown } | null = null;
      try {
        const { anyFlowActionEnabled, isFlowActionEnabled } = await import(
          "@/lib/agent-v3/flow/flow-action-flags.server"
        );
        if (anyFlowActionEnabled()) {
          const { deriveOrderContextV3, loadOrderContextV3 } = await import(
            "@/lib/agent-v3/memory/order-context.server"
          );
          const { evaluateFlow } = await import("@/lib/agent-v3/flow/flow-engine.server");

          const earlyPreviousOrderContext = await loadOrderContextV3(phoneStr, workspaceId);
          const earlyHistory = history.map((m) => ({
            role: m.role === "agent" ? ("agent" as const) : ("customer" as const),
            content: m.content,
          }));
          const earlyOrderContext = deriveOrderContextV3(
            effectiveAgentMessage,
            earlyHistory,
            earlyPreviousOrderContext,
          );
          const earlyFlowDecision = evaluateFlow(earlyOrderContext, businessDecision);

          if (isFlowActionEnabled(earlyFlowDecision.action)) {
            flowActionHint = {
              version: earlyFlowDecision.version,
              action: earlyFlowDecision.action,
              reasonCode: earlyFlowDecision.reasonCode,
              reason: earlyFlowDecision.reason,
              payload: earlyFlowDecision.payload,
            };
            console.log("[FLOW-ENGINE] FlowAction LIGADA influenciando a resposta:", flowActionHint);
          }
        }
      } catch (earlyFlowError) {
        console.warn("[FLOW-ENGINE] Falha na checagem antecipada (seguindo sem hint, Claude decide normalmente):", earlyFlowError);
        flowActionHint = null;
      }

      console.log("RETURN-PONTO: chegou na V3", { phone: phoneStr });

      const { executeAgent } = await import("@/lib/agent-v3/core/execute-agent.server");
      
      const orchestratorStartAt = Date.now();
      await logExecutionTrace({
        traceId,
        step: "orchestrator_start",
        conversationId: conversationId || undefined,
        phone: phoneStr,
        messageId: msgId
      });

      console.log("executeAgent foi chamado? SIM");
      const execResult = await executeAgent({
        traceId, // Pass traceId to executeAgent
        userId: num.user_id,
        flowActionHint,
        workspaceId,
        conversationId: conversationId ?? undefined,
        phone: phoneStr,
        message: effectiveAgentMessage,
        history: history,
        historyTelemetry: historyTelemetry,
        anthropicApiKey,
        routerContext: {
          isFirstTurn: history.length === 0,
          funnelAlreadyCompleted,
        },
        skipRouter: !(content.kind === "texto" && !deferredFunnelMessage),
        rememberedContext: {
          platform: customerMemory?.preferredPlatform ?? null,
          product: customerMemory?.preferredProduct ?? null,
        },
        extraContext: [
          customerMemoryContext,
          businessDecisionToPromptV3(businessDecision),
        ].filter(Boolean).join("\n\n") || undefined,
        businessDecision,
        funnelAlreadyCompleted,
        // Cliente originado de disparo (abordagem fria) vs orgânico
        // (Meta Ads/interesse espontâneo). contacts.source="disparo" já
        // era gravado há tempos, só nunca era lido de volta pra mudar o
        // comportamento da Júlia — achado em 09/08/2026.
        isOutboundReply: contactSource === "disparo",
        customerLifecycle: customerMemory?.lifecycle,
        repurchasePotential: customerMemory?.repurchasePotential,
        inputKind: content.kind,
        imageSource: resolvedImageSource,
        messageId: msgId
      });

      const orchestratorDuration = Date.now() - orchestratorStartAt;
      await logExecutionTrace({
        traceId,
        step: "orchestrator_end",
        durationMs: orchestratorDuration,
        conversationId: conversationId || undefined,
        phone: phoneStr,
        details: {
          route: execResult.route,
          claudeCalled: execResult.claudeCalled,
          replyPreview: execResult.reply?.slice(0, 100)
        }
      });

      console.log("[SMART-ROUTER]", {
        route: execResult.route,
        reason: execResult.routerReason,
        phone: phoneStr,
        mensagem: effectiveAgentMessage.slice(0, 80),
        costSaved: !execResult.claudeCalled ? "1 Claude call" : null,
      });

      if (execResult.route === "code") {
        try {
          const sendResult = await sendAgentTextGuarded(creds, sendTarget, execResult.reply, {
            conversationId: conversationId as string,
            source: "smart_router_v1",
          });

          if (conversationId) {
            const { error: persistErr } = await supabaseAdmin.from("messages").insert({
              conversation_id: conversationId,
              user_id: num.user_id,
              workspace_id: workspaceId,
              sender: "agente",
              kind: "texto",
              body: sendResult.transformed,
            });
            if (persistErr) {
              console.error("[SMART-ROUTER] Resposta enviada, mas falhou ao persistir:", persistErr);
            }
            await supabaseAdmin
              .from("conversations")
              .update({
                last_message_preview: sendResult.transformed.slice(0, 120),
                last_message_at: new Date().toISOString(),
                status: "aguardando",
              })
              .eq("id", conversationId);
          }

          return new Response(`ok (smart router — ${execResult.routerReason})`);
        } catch (routerSendError) {
          // Falha ao enviar a resposta do router: loga e segue o fluxo,
          // não deixa a mensagem cair no limbo sem resposta nenhuma.
          console.error("[SMART-ROUTER] Falha ao enviar resposta:", routerSendError);
          return new Response("erro (smart router — falha no envio)", { status: 500 });
        }
      }

      // route === "claude": segue o fluxo normal, extenso, já existente,
      // que processa v3Response (memória, CRM, humanização, envio, etc.)
      const v3Response = execResult.agentResult!;

      if (contactId) {
        try {
          const { persistCustomerCommercialMemory } = await import(
            "@/lib/agent-v3/memory/customer-memory.server"
          );

          customerMemory = await persistCustomerCommercialMemory({
            supabaseAdmin,
            workspaceId,
            userId: num.user_id,
            contactId,
            current: customerMemory,
            customerMessage: finalMsgText,
            platform:
              (v3Response.modules.selection_context as any)?.platform ??
              customerMemory?.preferredPlatform ??
              null,
            product:
              (v3Response.modules.selection_context as any)?.product ??
              customerMemory?.preferredProduct ??
              null,
            intent: (v3Response.modules.selection_context as any)?.intent ?? null,
            stage: v3Response.intelligence.stage,
            purchaseProbability: v3Response.intelligence.purchase_probability,
          });

          if (
            customerMemory.lifecycle === "cliente" ||
            customerMemory.lifecycle === "cliente_recorrente"
          ) {
            if (conversationId) {
              await supabaseAdmin
                .from("conversations")
                .update({ status: "convertido" })
                .eq("id", conversationId)
                .eq("workspace_id", workspaceId);
            }

            // Memória de cliente NÃO força todo novo turno para Pós-venda.
            // Um cliente antigo pode estar fazendo uma nova compra e deve permanecer
            // em Compra/Pagamento até que o pedido atual seja confirmado.
            const currentIntent = String((v3Response.modules.selection_context as any)?.intent || "");
            const confirmedNow = /\b((?:j[aá]\s+)?(?:comprei|paguei)(?:\s+hoje|\s+ontem)?|j[aá]\s+fiz\s+o\s+pedido|pedido\s+(?:feito|realizado)|pagamento\s+(?:feito|realizado))\b/i.test(finalMsgText);
            if (confirmedNow || currentIntent === "pos_compra" || currentIntent === "suporte") {
              v3Response.intelligence.temperature = confirmedNow ? "quente" : v3Response.intelligence.temperature;
              v3Response.intelligence.intent = currentIntent === "suporte" ? "suporte" : "pos_compra";
              v3Response.intelligence.stage = "pos_venda";
              if (confirmedNow) v3Response.intelligence.purchase_probability = 100;
              else if (customerMemory.repurchasePotential === "alto") {
                v3Response.intelligence.purchase_probability = Math.max(v3Response.intelligence.purchase_probability, 90);
                v3Response.intelligence.temperature = "quente";
              } else if (customerMemory.repurchasePotential === "medio") {
                v3Response.intelligence.purchase_probability = Math.max(v3Response.intelligence.purchase_probability, 70);
                if (v3Response.intelligence.temperature === "frio") v3Response.intelligence.temperature = "morno";
              }
              v3Response.intelligence.recommended_action =
                `Cliente existente. Potencial de recompra: ${customerMemory.repurchasePotential}. Não reiniciar qualificação.`;
            }
          }
        } catch (memoryPersistError) {
          console.warn("[CUSTOMER-MEMORY] Falha ao atualizar memória comercial:", memoryPersistError);
        }
      }

      // ============================================================
      // ORDER CONTEXT + FLOW ENGINE (fase de observação) — NÃO
      // influenciam a resposta. Só derivam, avaliam e logam, pra
      // validar antes de qualquer decisão real depender disso.
      // ============================================================
      try {
        const { deriveOrderContextV3, loadOrderContextV3, saveOrderContextV3 } = await import(
          "@/lib/agent-v3/memory/order-context.server"
        );
        const { evaluateFlow } = await import("@/lib/agent-v3/flow/flow-engine.server");

        const previousOrderContext = await loadOrderContextV3(phoneStr, workspaceId);
        const agentHistoryForOrderContext = history.map((m) => ({
          role: m.role === "agent" ? ("agent" as const) : ("customer" as const),
          content: m.content,
        }));
        const newOrderContext = deriveOrderContextV3(
          effectiveAgentMessage,
          agentHistoryForOrderContext,
          previousOrderContext,
        );

        const flowResult = evaluateFlow(newOrderContext, businessDecision);

        console.log("[ORDER-CONTEXT] Evolução do pedido:", {
          phone: phoneStr,
          mensagem: effectiveAgentMessage.slice(0, 80),
          antes: {
            platform: previousOrderContext.platform,
            service: previousOrderContext.service,
            quantity: previousOrderContext.quantity,
            missingFields: previousOrderContext.missingFields,
          },
          depois: {
            platform: newOrderContext.platform,
            service: newOrderContext.service,
            quantity: newOrderContext.quantity,
            missingFields: newOrderContext.missingFields,
            readyForQuote: newOrderContext.readyForQuote,
            readyForPayment: newOrderContext.readyForPayment,
            confidence: newOrderContext.confidence,
          },
        });

        console.log("[FLOW-ENGINE] Decisão determinística (modo sombra — não influencia a resposta):", {
          phone: phoneStr,
          nextAction: flowResult.action,
          reason: flowResult.reason,
          canQuote: flowResult.canQuote,
          canCheckout: flowResult.canCheckout,
          canFinish: flowResult.canFinish,
          missingFields: flowResult.requiredFields,
        });

        // Registra a decisão pra medir precisão por ação depois (revisão
        // manual), critério de promoção individual via feature flag.
        await (supabaseAdmin as any).from("flow_action_decisions").insert({
          workspace_id: workspaceId,
          phone: phoneStr,
          conversation_id: conversationId ?? null,
          action: flowResult.action,
          reason: flowResult.reason,
          order_context_snapshot: {
            platform: newOrderContext.platform,
            service: newOrderContext.service,
            quantity: newOrderContext.quantity,
            missingFields: newOrderContext.missingFields,
          },
        } as any);

        await saveOrderContextV3(phoneStr, workspaceId, num.user_id, newOrderContext);
      } catch (orderContextError) {
        console.warn("[ORDER-CONTEXT/FLOW-ENGINE] Falha ao processar (não bloqueia o fluxo):", orderContextError);
      }

      // Sincroniza a caixa Frio/Morno/Quente/Cliente do CRM.
      // Ela é persistente e usa evidências objetivas do funil comercial, em vez
      // de depender somente da classificação de uma mensagem isolada.
      if (contactId) {
        try {
          const { syncPersistentContactTemperatureV3 } = await import(
            "@/lib/agent-v3/memory/contact-temperature.server"
          );

          const {
            calculateBasePurchaseProbability,
            deriveTemperatureFromProbability,
            applyBusinessDecisionToIntelligence,
          } = await import("@/lib/agent-v3/core/intelligence-utils.server");

          const selectionContextForTemperature =
            (v3Response?.modules?.selection_context as any) || {};

          let purchaseProbability = v3Response?.intelligence?.purchase_probability;
          let intelligenceTemperature = v3Response?.intelligence?.temperature;

          // Se não houver resposta do Claude (Smart Router), derivamos da inteligência de vendas
          if (purchaseProbability === undefined || intelligenceTemperature === undefined) {
            const baseProb = calculateBasePurchaseProbability({
              intent: selectionContextForTemperature.intent || "desconhecido",
              platform: selectionContextForTemperature.platform || customerMemory?.preferredPlatform,
              product: selectionContextForTemperature.product || customerMemory?.preferredProduct,
              hasQuantity: selectionContextForTemperature.hasQuantity,
              hasPaidSignal: selectionContextForTemperature.hasPaidSignal,
              hasPaymentSignal: selectionContextForTemperature.hasPaymentSignal,
            });

            const decision = applyBusinessDecisionToIntelligence({
              state: businessDecision.state,
              currentProb: baseProb,
              repurchasePotential: customerMemory?.repurchasePotential,
            });

            purchaseProbability = decision.purchase_probability;
            intelligenceTemperature = decision.temperature;
          }

          contactTemperature = await syncPersistentContactTemperatureV3({
            supabaseAdmin,
            workspaceId,
            contactId,
            current: contactTemperature,
            lifecycle: customerMemory?.lifecycle ?? null,
            purchaseCount: customerMemory?.purchaseCount ?? 0,
            businessState: businessDecision.state,
            intelligenceTemperature: intelligenceTemperature as any,
            purchaseProbability: purchaseProbability!,
            hasPlatform: Boolean(
              selectionContextForTemperature.platform ||
                customerMemory?.preferredPlatform,
            ),
            hasProduct: Boolean(
              selectionContextForTemperature.product ||
                customerMemory?.preferredProduct,
            ),
          });
        } catch (temperatureSyncError) {
          console.warn(
            "[CONTACT-TEMPERATURE-V3] Falha não bloqueante:",
            temperatureSyncError,
          );
        }
      }

      if (conversationId) {
        try {
          const { persistBusinessStateV3 } = await import(
            "@/lib/agent-v3/memory/business-state-memory.server"
          );

          // Usa a decisão pré-LLM como estado autoritativo. A inteligência serve
          // como telemetria/visão comercial, mas não pode empurrar a conversa
          // para trás no funil.
          await persistBusinessStateV3({
            supabaseAdmin,
            userId: num.user_id,
            workspaceId,
            conversationId,
            decision: businessDecision,
            summary: `${businessDecision.state}: ${businessDecision.reason}`,
          });
        } catch (businessStateError) {
          console.warn("[BUSINESS-STATE-V3] Falha ao persistir estado:", businessStateError);
        }
      }

      console.log("RETURN-PONTO: V3 respondeu", { phone: phoneStr });
      const replyParts = v3Response.replies.length > 0 ? v3Response.replies : [v3Response.response];
      const replyText = replyParts.join("\n\n");

      const replyWithAudio = shouldReplyWithAudio({
        inputKind: content.kind,
        replyText,
        intent: v3Response.intelligence.intent,
        stage: v3Response.intelligence.stage,
      });

      if (content.kind === "audio") {
        console.log("[AUDIO-V3] 3/5 Claude concluiu resposta", {
          chars: replyText.length,
          replyMode: replyWithAudio ? "audio" : "texto",
          intent: v3Response.intelligence.intent,
          stage: v3Response.intelligence.stage,
        });
      }

      const finalConvId = String(conversationId || phoneStr);

      const targetHumanDelayMs = calculateHumanResponseTargetMs(replyText, humanization);
      const elapsedBeforeDeliveryMs = Date.now() - inboundStartedAt;
      const remainingFirstReplyDelayMs = Math.max(
        0,
        targetHumanDelayMs - elapsedBeforeDeliveryMs,
      );

      let sentAsAudio = false;
      let deliveredReplyText = replyText;

      if (replyWithAudio && elevenlabsApiKey && elevenlabsVoiceId) {
        try {
          const { textToSpeechV3 } = await import("@/lib/agent-v3/integrations/audio-processor.server");
          const { uazapiSendAudio, uazapiSendRecording, uazapiClearPresence } = await import("@/lib/uazapi.server");

          if (humanization.enabled && humanization.audio_recording_enabled) {
            await uazapiSendRecording(
              creds,
              sendTarget,
              Math.max(3000, remainingFirstReplyDelayMs),
            ).catch((error) => {
              console.warn("[UAZ-WEBHOOK] Não foi possível sinalizar gravando áudio:", error);
            });
          }

          const audioBase64 = await textToSpeechV3({
            apiKey: elevenlabsApiKey,
            voiceId: elevenlabsVoiceId,
            text: replyText,
          });

          console.log("[AUDIO-V3] 4/5 ElevenLabs concluiu TTS", {
            chars: replyText.length,
            audioDataChars: audioBase64.length,
            voiceId: `${elevenlabsVoiceId.slice(0, 4)}…`,
          });

          // O tempo de geração do Claude/TTS conta como parte da espera humana.
          const remainingAudioDelayMs = Math.max(
            0,
            targetHumanDelayMs - (Date.now() - inboundStartedAt),
          );
          await sleepMs(remainingAudioDelayMs);

          await uazapiSendAudio(creds, sendTarget, audioBase64);
          console.log("[AUDIO-V3] 5/5 nota de voz enviada pela Uazapi");
          await uazapiClearPresence(creds, sendTarget).catch(() => undefined);
          sentAsAudio = true;

          // Registra explicitamente o outbound de áudio. O arquivo TTS é enviado
          // como base64 e não possui URL persistente; o body mantém a transcrição
          // exata usada para gerar o áudio e a memória conversacional.
          if (conversationId) {
            const { error: audioPersistErr } = await supabaseAdmin
              .from("messages")
              .insert({
                conversation_id: conversationId,
                user_id: num.user_id,
                workspace_id: workspaceId,
                sender: "agente",
                kind: "audio",
                body: replyText,
              });
            if (audioPersistErr) {
              console.error("[UAZ-WEBHOOK] Áudio enviado, mas falhou ao persistir outbound no CRM:", audioPersistErr);
            }
          }

          console.log("[UAZ-WEBHOOK] Resposta do Agent V3 enviada por áudio");
        } catch (audioSendErr) {
          console.error("[UAZ-WEBHOOK] Falha ao responder por áudio; usando texto:", audioSendErr);
        }
      }

      if (
        replyWithAudio &&
        (!elevenlabsApiKey || !elevenlabsVoiceId)
      ) {
        console.error("[AUDIO-V3] Resposta em áudio desativada por configuração incompleta", {
          hasElevenLabsKey: !!elevenlabsApiKey,
          hasVoiceId: !!elevenlabsVoiceId,
        });
      }

      if (!sentAsAudio) {
        const recentAgentBodies = history
          .filter((item) => item.role === "agent")
          .map((item) => item.content)
          .slice(-3);
        const deliveredParts: string[] = [];

        // Mensagens recebidas em sequência são serializadas pelo lock da conversa.
        // O orchestrator já separa respostas longas/parágrafos em partes próprias.
        // Enviar o join() como uma única mensagem anulava completamente o splitter.
        for (let partIndex = 0; partIndex < replyParts.length; partIndex += 1) {
          const part = replyParts[partIndex];

          if (humanization.enabled) {
            if (partIndex === 0) {
              await sleepMs(remainingFirstReplyDelayMs);
            } else {
              const partDelayMs = calculatePartDelayMs(humanization);
              if (humanization.typing_enabled) {
                const { uazapiSendTyping } = await import("@/lib/uazapi.server");
                await uazapiSendTyping(creds, sendTarget, partDelayMs).catch(() => undefined);
              }
              await sleepMs(partDelayMs);
            }
          }

          console.log("RETURN-PONTO: enviando pro whatsapp", { phone: phoneStr });
          const sendResult = await sendAgentTextGuarded(
            creds,
            sendTarget,
            part,
            {
              conversationId: finalConvId,
              source: "agent_v3",
              applyHumanize: true,
              recentAgentBodiesOverride: [...recentAgentBodies, ...deliveredParts].slice(-3),
            },
          );
          console.log("RETURN-PONTO: enviado com sucesso", { phone: phoneStr });
          
          await logExecutionTrace({
            traceId,
            step: "whatsapp_send",
            conversationId: finalConvId,
            phone: phoneStr,
            details: {
              partIndex,
              totalParts: replyParts.length,
              textPreview: part.slice(0, 100)
            }
          });

          deliveredParts.push(sendResult.transformed);

          // O envio via Uazapi não garante que o webhook de eco fromMe será
          // entregue. Persistimos cada parte confirmada aqui para que o CRM
          // reflita exatamente o que o cliente recebeu. Não usamos external_id:
          // se o provedor também ecoar a mensagem, o fluxo fromMe continua
          // responsável por registrar o evento externo sem colisão artificial.
          if (conversationId) {
            const { error: outboundPersistErr } = await supabaseAdmin
              .from("messages")
              .insert({
                conversation_id: conversationId,
                user_id: num.user_id,
                workspace_id: workspaceId,
                sender: "agente",
                kind: "texto",
                body: sendResult.transformed,
              });
            if (outboundPersistErr) {
              console.error("[UAZ-WEBHOOK] Resposta enviada, mas falhou ao persistir parte no CRM:", outboundPersistErr);
            }
          }
        }

        deliveredReplyText = deliveredParts.join("\n\n");
      }

      const nextHistory = [
        ...history,
        { role: "customer" as const, content: effectiveAgentMessage },
        // Salva exatamente o texto que chegou ao cliente após humanização/emoji guard.
        { role: "agent" as const, content: deliveredReplyText },
      ].slice(-100);

      // Só persiste a resposta do agente depois que o envio foi confirmado.
      // Antes, uma falha no WhatsApp deixava o histórico afirmando que o cliente
      // recebeu uma resposta que nunca foi entregue.
      console.log("----------------------------------------------------");
      console.log("Fluxo");
      console.log("O código retornou após o funil? NÃO (seguindo para Agent V3)");
      console.log("----------------------------------------------------");
      console.log("Resultado Final");
      console.log("FUNIL IGNORADO");
      console.log("Motivo: Gatilho não identificado ou execução já completada.");
      console.log("==============================");

      await saveConversationStateV3(

        num.user_id,
        phoneStr,
        nextHistory,
        workspaceId,
      );

      console.log(`[UAZ-WEBHOOK] [AUDIT] RETORNO: AI processed para conversa ${conversationId}`);
      return new Response("ok (AI processed)");

      } catch (e: any) {
        const criticalErrorMessage = String(e?.message ?? e ?? "erro desconhecido");
        runtimeNeedsReview = true;
        console.error("[UAZ-WEBHOOK] AI Critical Error:", criticalErrorMessage);

        // A mensagem do cliente já foi persistida no CRM antes deste ponto.
        // Não pedimos retry ao provedor para evitar uma segunda resposta, mas
        // também não deixamos a falha silenciosa: a conversa fica visível para
        // atendimento humano/revisão.
        if (conversationId) {
          const { error: reviewErr } = await supabaseAdmin
            .from("conversations")
            .update({
              needs_review: true,
              review_reason: `falha crítica no Agent V3: ${criticalErrorMessage}`.slice(0, 500),
            })
            .eq("id", conversationId);
          if (reviewErr) {
            console.error("[UAZ-WEBHOOK] Failed to flag AI error for review:", reviewErr);
          }
        }

        try {
          await reviewAgentInboundJob(
            supabaseAdmin,
            persistedMessageId,
            lockHolder,
            `Agent V3 critical error: ${criticalErrorMessage}`,
          );
        } catch (jobError) {
          console.error("[UAZ-WEBHOOK] Falha ao marcar inbound job para revisão:", jobError);
        }

        console.log(`[UAZ-WEBHOOK] [AUDIT] RETORNO: AI error flagged para conversa ${conversationId}`);
        return new Response("ok (AI error flagged for review)");
      } finally {
        // Finaliza a ownership durável ANTES de liberar a conversa. Assim outro
        // worker nunca observa a conversa livre enquanto este job ainda aparece
        // como processing. Se a conclusão falhar após possíveis efeitos externos,
        // mantemos processing: a recuperação de stale o levará a needs_review,
        // nunca a replay cego.
        if (!runtimeNeedsReview) {
          try {
            await completeAgentInboundJob(
              supabaseAdmin,
              persistedMessageId,
              lockHolder,
            );
          } catch (jobError) {
            console.error(
              "[UAZ-WEBHOOK] Falha ao concluir agent inbound job; mantendo estado seguro para revisão:",
              jobError,
            );
          }
        }

        await releaseConversationDbLock(
          supabaseAdmin,
          conversationId,
          lockHolder,
        );
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
