import { createFileRoute } from "@tanstack/react-router";
import { sendAgentTextGuarded } from "@/lib/send-agent-guarded.server";

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
const DB_CONVERSATION_LOCK_STALE_MS = 2 * 60 * 1000;

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

type UazapiPayload = {
  event?: string;
  EventType?: string;
  token?: string;
  instance?: { token?: string } | string;
  message?: {
    chatid?: string;
    sender?: string;
    messageid?: string;
    messageId?: string;
    id?: string;
    key_id?: string;
    wa_messageid?: string;
    key?: { id?: string };
    fromMe?: boolean;
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
];

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
  // Somente emoji/reação curta, sem letras ou números. Evita responder a 👍 🤝 ❤️ etc.
  const stripped = text
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D\s]+/gu, "")
    .trim();
  return stripped.length === 0 && text.length <= 24;
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

function isConversationDeferralMessage(value: string): boolean {
  const text = normalizeFunnelText(value);
  if (!text) return false;
  return [
    /\bmais tarde\b/,
    /\bfalamos depois\b/,
    /\bdepois falamos\b/,
    /\bdepois a gente fala\b/,
    /\bte chamo depois\b/,
    /\bchamo mais tarde\b/,
    /\bagora nao posso\b/,
    /\bestou trabalhando\b/,
    /\bto trabalhando\b/,
    /\bamanha (?:falamos|te chamo|eu chamo)\b/,
    /\bdepois das \d{1,2}(?::\d{2})?\b/,
  ].some((pattern) => pattern.test(text));
}

async function shouldCancelRunningFunnel(params: {
  supabaseAdmin: any;
  conversationId: string;
  startedAtIso: string;
}): Promise<boolean> {
  const { data, error } = await params.supabaseAdmin
    .from("messages")
    .select("body, sender, created_at")
    .eq("conversation_id", params.conversationId)
    .eq("sender", "cliente")
    .gt("created_at", params.startedAtIso)
    .order("created_at", { ascending: false })
    .limit(8);

  if (error) {
    console.warn("[WELCOME-FUNNEL] Não foi possível verificar pausa do cliente:", error);
    return false;
  }

  return (data || []).some((row: any) => {
    const body = String(row?.body || "").trim();
    if (!body) return false;

    // Qualquer nova fala substantiva do cliente durante o funil significa que
    // ele começou uma conversa real. Interrompe as próximas peças automáticas
    // para não mandar tabela/vídeo por cima da pergunta dele.
    if (isConversationDeferralMessage(body)) return true;
    return body.length >= 2;
  });
}

function normalizeFunnelText(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function funnelMatchesMessage(triggerKeywords: string, message: string): boolean {
  const normalizedMessage = normalizeFunnelText(message);
  if (!normalizedMessage) return false;

  const triggers = String(triggerKeywords || "")
    .split(",")
    .map((item) => normalizeFunnelText(item))
    .filter(Boolean);

  if (triggers.length === 0) return false;
  return triggers.some((trigger) => normalizedMessage.includes(trigger));
}

function funnelStepDelayMs(step: WelcomeFunnelStep | undefined, fallbackSeconds: number): number {
  const raw = step?.delay_seconds ?? fallbackSeconds ?? 0;
  const seconds = Math.max(0, Math.min(180, Number(raw) || 0));
  return Math.round(seconds * 1000);
}

async function persistFunnelOutbound(params: {
  supabaseAdmin: any;
  conversationId: string;
  userId: string;
  workspaceId: string;
  kind: "texto" | "audio";
  body: string;
  audioUrl?: string;
}): Promise<void> {
  const { error } = await params.supabaseAdmin
    .from("messages")
    .insert({
      conversation_id: params.conversationId,
      user_id: params.userId,
      workspace_id: params.workspaceId,
      sender: "agente",
      kind: params.kind,
      body: params.body,
      ...(params.audioUrl ? { audio_url: params.audioUrl } : {}),
    });

  if (error) {
    console.error("[WELCOME-FUNNEL] Enviado, mas falhou ao persistir outbound no CRM:", error);
  }
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
}): Promise<void> {
  const {
    supabaseAdmin,
    funnel,
    contactId,
    conversationId,
    userId,
    workspaceId,
    phone,
    creds,
  } = params;

  const { uazapiSendAudio, uazapiSendMedia, uazapiSendTyping, uazapiSendRecording, uazapiClearPresence } =
    await import("@/lib/uazapi.server");
  const { sleepMs } = await import("@/lib/agent-v3/humanization.server");

  const steps = funnel.steps || {};
  let stepIndex = 0;
  const funnelStartedAtIso = new Date().toISOString();

  const ensureCustomerDidNotPause = async () => {
    const cancelled = await shouldCancelRunningFunnel({
      supabaseAdmin,
      conversationId,
      startedAtIso: funnelStartedAtIso,
    });
    if (cancelled) {
      throw new Error("WELCOME_FUNNEL_CANCELLED_BY_CUSTOMER_MESSAGE");
    }
  };

  const markStep = async (label: string) => {
    stepIndex += 1;
    console.log(`[WELCOME-FUNNEL] Etapa ${stepIndex} concluída: ${label}`);
  };

  const sendTextStep = async (
    key: "welcome_text" | "panel_text" | "services_text",
    source: string,
  ) => {
    const step = steps[key];
    const text = step?.text?.trim();
    if (!step?.enabled || !text) return;

    await ensureCustomerDidNotPause();
    const delayMs = funnelStepDelayMs(step, funnel.delay_seconds);
    if (delayMs > 0) {
      await uazapiSendTyping(creds, phone, delayMs).catch(() => undefined);
      await sleepMs(delayMs);
      await ensureCustomerDidNotPause();
    }

    const result = await sendAgentTextGuarded(creds, phone, text, {
      conversationId,
      source,
      isBlastOpening: key === "welcome_text",
    });
    await persistFunnelOutbound({
      supabaseAdmin,
      conversationId,
      userId,
      workspaceId,
      kind: "texto",
      body: result.transformed,
    });
    await markStep(key);
  };

  // Ordem configurada no menu Números:
  // 1 texto opcional → 2 áudio → 3 painel → 4 vídeo → 5 tabela.
  // Para o fluxo Meta Ads desejado, basta deixar "Texto de boas-vindas" desligado,
  // fazendo o Áudio ser efetivamente a primeira saída.
  await sendTextStep("welcome_text", "welcome_funnel_welcome_text");

  if (steps.audio?.enabled && steps.audio.url?.trim()) {
    await ensureCustomerDidNotPause();
    const delayMs = funnelStepDelayMs(steps.audio, funnel.delay_seconds);
    if (delayMs > 0) {
      await uazapiSendRecording(creds, phone, delayMs).catch(() => undefined);
      await sleepMs(delayMs);
      await ensureCustomerDidNotPause();
    }
    await uazapiSendAudio(creds, phone, steps.audio.url.trim());
    await uazapiClearPresence(creds, phone).catch(() => undefined);
    await persistFunnelOutbound({
      supabaseAdmin,
      conversationId,
      userId,
      workspaceId,
      kind: "audio",
      body: "[Áudio do funil de boas-vindas]",
      audioUrl: steps.audio.url.trim(),
    });
    await markStep("audio");
  }

  await sendTextStep("panel_text", "welcome_funnel_panel_text");

  if (steps.video?.enabled && steps.video.url?.trim()) {
    await ensureCustomerDidNotPause();
    const delayMs = funnelStepDelayMs(steps.video, funnel.delay_seconds);
    if (delayMs > 0) {
      await uazapiSendTyping(creds, phone, delayMs).catch(() => undefined);
      await sleepMs(delayMs);
      await ensureCustomerDidNotPause();
    }
    const caption = steps.video.caption?.trim() || undefined;
    await uazapiSendMedia(creds, phone, "video", steps.video.url.trim(), caption);
    await persistFunnelOutbound({
      supabaseAdmin,
      conversationId,
      userId,
      workspaceId,
      kind: "texto",
      body: caption || "[Vídeo explicativo do funil]",
    });
    await markStep("video");
  }

  await sendTextStep("services_text", "welcome_funnel_services_text");
}

async function processWebhook(payload: UazapiPayload): Promise<Response> {
    const inboundStartedAt = Date.now();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const msgLocal = payload.message ?? payload.data ?? {};
    const phoneLocal = extractPhone(msgLocal.chatid, msgLocal.sender);
    const phoneStr = String(phoneLocal || "");
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

    if (wasMessageIdRecentlySeen(msgId)) {
      console.log(`[UAZ-WEBHOOK] Ignorando duplicata em memória (msgId: ${msgId})`);
      return new Response("ok (duplicate msgId)");
    }

    // 2. SYNC TO CRM (Always do this for all incoming messages)
    let contactId: string | undefined = undefined;
    let contactProfile: string | null = null;
    let contactTemperature: string | null = null;
    let conversationId: string | undefined = undefined;
    let duplicateMessageInDb = false;
    let messagePersistedInDb = false;

    try {
      // Upsert Contact
      const { data: contact, error: contactErr } = await supabaseAdmin
        .from("contacts")
        .upsert({
          telefone: phoneStr,
          user_id: num.user_id,
          workspace_id: num.workspace_id,
          whatsapp_number_id: num.id,
          nome: msgLocal.sender?.split("@")[0] || phoneStr,
        }, { onConflict: "user_id,telefone" })
        .select("id, photo_url, perfil, temperatura")
        .single();

      if (contactErr) throw contactErr;
      if (contact?.id) contactId = contact.id;
      contactProfile = contact?.perfil ?? null;
      contactTemperature = contact?.temperatura ?? null;

      // Hidrata a foto real do WhatsApp quando o contato ainda não possui uma.
      // O menu Conversas usa contacts.photo_url; sem este passo o avatar ficava
      // eternamente nas iniciais para contatos criados diretamente pelo webhook.
      if (contact?.id && !contact.photo_url && !msgLocal.fromMe) {
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
              .eq("workspace_id", num.workspace_id);
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
          workspace_id: num.workspace_id,
          whatsapp_number_id: num.id,
          last_message_preview: content.text.slice(0, 100),
          last_message_at: new Date().toISOString(),
          status: msgLocal.fromMe ? "agente_respondendo" : "aguardando",
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

      const { error: msgErr } = await supabaseAdmin
        .from("messages")
        .insert({
          conversation_id: conversationId,
          user_id: num.user_id,
          workspace_id: num.workspace_id,
          sender: msgLocal.fromMe ? "agente" : "cliente",
          kind: dbKind,
          body: content.text,
          audio_url: content.mediaUrl || undefined,
          external_id: msgId,
        });

      if (msgErr) {
        if (msgErr.code === "23505") {
          duplicateMessageInDb = true;
        } else {
          throw msgErr;
        }
      } else {
        messagePersistedInDb = true;
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
    if (duplicateMessageInDb) {
      console.log(`[UAZ-WEBHOOK] Ignorando duplicata persistida (msgId: ${msgId})`);
      return new Response("ok (duplicate persisted msgId)");
    }

    // Nunca execute a IA quando a mensagem de entrada não foi persistida.
    // Caso o CRM esteja indisponível, responder mesmo assim cria dois riscos:
    // 1) o histórico fica diferente do que foi gravado no banco; e
    // 2) uma retransmissão do provedor pode gerar uma segunda resposta automática.
    // Retornamos 503 para permitir retry do provedor sem marcar o messageId como concluído.
    if (!messagePersistedInDb) {
      console.error(`[UAZ-WEBHOOK] CRM sync incompleto; adiando processamento do msgId ${msgId}`);
      return new Response("retry (crm sync incomplete)", { status: 503 });
    }

    // 3. AI GATE
    if (msgLocal.fromMe) {
      return new Response("ok (sync only for fromMe)");
    }

    const workspaceId = num.workspace_id?.trim();
    if (!workspaceId) {
      console.error("[UAZ-WEBHOOK] Número sem workspace_id; bloqueando Agent V3 para evitar vazamento entre workspaces", {
        userId: num.user_id,
        phone: phoneStr,
      });
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

    // Reações simples não precisam consumir Claude nem gerar "qualquer coisa chama".
    // A mensagem continua salva no CRM, apenas não há resposta automática.
    if (content.kind === "texto" && isReactionOnlyMessage(content.text)) {
      return new Response("ok (reaction only)");
    }

    // 3.5. WELCOME FUNNEL — independente do liga/desliga do Agent V3.
    // IMPORTANTE: primeiro verificamos se a mensagem realmente bate em um gatilho.
    // Mensagens comuns NÃO consultam welcome_funnel_runs e nunca ficam dependentes
    // de migrations novas do funil.
    const isKnownCustomer =
      customerMemory?.lifecycle === "cliente" ||
      customerMemory?.lifecycle === "cliente_recorrente" ||
      contactTemperature === "cliente" ||
      contactProfile === "ativo";

    if (
      contactId &&
      conversationId &&
      content.kind === "texto" &&
      (!isKnownCustomer || canRepeatWelcomeFunnelForTest(phoneStr))
    ) {
      const { data: funnelRows, error: funnelErr } = await (supabaseAdmin as any)
        .from("welcome_funnels")
        .select("id, name, delay_seconds, trigger_keywords, steps, sort_order")
        .eq("user_id", num.user_id)
        .eq("workspace_id", workspaceId)
        .eq("whatsapp_number_id", num.id)
        .eq("enabled", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (funnelErr) {
        // FAIL-OPEN: problema no subsistema do funil não pode derrubar o atendimento.
        console.error("[WELCOME-FUNNEL] Falha ao carregar funis; seguindo para Agent V3:", funnelErr);
      } else {
        const matchingFunnel = ((funnelRows || []) as WelcomeFunnelRow[]).find((row) =>
          funnelMatchesMessage(row.trigger_keywords, content.text),
        );

        if (matchingFunnel) {
          // Usa somente colunas existentes desde a criação original da tabela.
          // Não depende de status/updated_at/last_step para funcionar.
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
              // Isso funciona mesmo sem nenhuma migration de estado adicional.
              const { error: claimErr } = await (supabaseAdmin as any)
                .from("welcome_funnel_runs")
                .insert({
                  funnel_id: matchingFunnel.id,
                  contact_id: contactId,
                  user_id: num.user_id,
                  workspace_id: workspaceId,
                  fired_at: new Date().toISOString(),
                });

              if (claimErr) {
                if (claimErr.code === "23505") {
                  // Outra instância ganhou o claim. Não mande IA junto com o funil.
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
                    await (supabaseAdmin as any)
                      .from("welcome_funnel_runs")
                      .delete()
                      .eq("funnel_id", matchingFunnel.id)
                      .eq("contact_id", contactId);
                    return new Response("ok (conversation busy)");
                  }

                  const creds = {
                    uazapi_url: num.uazapi_url ?? "",
                    uazapi_token: instanceToken,
                  };

                  console.log(`[WELCOME-FUNNEL] Disparando "${matchingFunnel.name}" para ${phoneStr}`);
                  await executeWelcomeFunnel({
                    supabaseAdmin,
                    funnel: matchingFunnel,
                    contactId,
                    conversationId,
                    userId: num.user_id,
                    workspaceId,
                    phone: phoneStr,
                    creds,
                  });

                  console.log(`[WELCOME-FUNNEL] Funil "${matchingFunnel.name}" concluído; Agent V3 assume nas próximas mensagens`);
                  return new Response("ok (welcome funnel completed)");
                } catch (funnelSendErr) {
                  if (
                    funnelSendErr instanceof Error &&
                    funnelSendErr.message === "WELCOME_FUNNEL_CANCELLED_BY_CUSTOMER_MESSAGE"
                  ) {
                    // Mantém o claim: cliente normal continua com regra "funil uma vez".
                    // Apenas interrompe as etapas restantes porque pediu para falar depois.
                    console.log(`[WELCOME-FUNNEL] Funil "${matchingFunnel.name}" interrompido: cliente iniciou conversa durante o envio`);
                    return new Response("ok (welcome funnel paused for live conversation)");
                  }

                  console.error("[WELCOME-FUNNEL] Falha durante envio:", funnelSendErr);

                  // Se houve falha técnica real, remove o marcador para permitir retry.
                  await (supabaseAdmin as any)
                    .from("welcome_funnel_runs")
                    .delete()
                    .eq("funnel_id", matchingFunnel.id)
                    .eq("contact_id", contactId);

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
                  return new Response("ok (welcome funnel failed; flagged for review)");
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
      return new Response("ok (agent disabled globally)");
    }

    if (conversationId) {
      const { data: conversationGate, error: conversationGateErr } = await supabaseAdmin
        .from("conversations")
        .select("agent_enabled, needs_review")
        .eq("id", conversationId)
        .maybeSingle();

      if (conversationGateErr) {
        console.error("[UAZ-WEBHOOK] Failed to read conversation gate:", conversationGateErr);
        return new Response("ok (conversation gate unavailable)");
      }

      // `needs_review` é sinalização para auditoria/atendimento humano, não um
      // segundo botão invisível. Quem controla resposta automática nesta conversa
      // é `agent_enabled`. Opt-out e bloqueio manual já gravam agent_enabled=false.
      if (conversationGate?.agent_enabled === false) {
        return new Response("ok (agent disabled for conversation)");
      }
    }

    // 5. AI PROCESSING (V3)
    // O webhook já é protegido pelo token da instância provisionada.
    // Não limitar o agente a um telefone fixo de teste em produção.
    const lockKey = `${workspaceId}:${phoneStr}`;
    return await withConversationLock(lockKey, async () => {
      const lockHolder = `v3:${msgId}:${Date.now()}`;
      if (conversationId) {
        const acquired = await acquireConversationDbLock(supabaseAdmin, conversationId, lockHolder);
        if (!acquired) {
          console.log(`[UAZ-WEBHOOK] Conversa já está sendo processada em outra instância: ${conversationId}`);
          return new Response("ok (conversation busy)");
        }
      }

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

      let finalMsgText = content.text || "";
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


      if (isHumanHandoffRequest(finalMsgText)) {
        const handoffReply =
          "Claro. Vou encaminhar seu atendimento para nossa equipe. Assim que um atendente estiver disponível, ele continua por aqui.";

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
            phoneStr,
            handoffReply,
            {
              conversationId: conversationId || undefined,
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

      const { runAgentV3Turn } = await import("@/lib/agent-v3/orchestrator.server");
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
          phoneStr,
          humanization.max_response_delay_ms,
        ).catch((error) => {
          console.warn("[UAZ-WEBHOOK] Não foi possível sinalizar digitando:", error);
        });
      }

      const { history, telemetry: historyTelemetry } = await getConversationStateV3(
        num.user_id,
        phoneStr,
        workspaceId,
      );

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
        console.log("[NATURALIDADE-V3] Silêncio natural: mensagem não exige resposta");
        return new Response("ok (natural conversational silence)");
      }

      const v3Response = await runAgentV3Turn({
        userId: num.user_id,
        workspaceId,
        conversationId: conversationId ?? undefined,
        phone: phoneStr,
        message: effectiveAgentMessage,
        history: history,
        historyTelemetry: historyTelemetry,
        anthropicApiKey,
        extraContext: customerMemoryContext || undefined,
        customerLifecycle: customerMemory?.lifecycle,
        repurchasePotential: customerMemory?.repurchasePotential,
        inputKind: content.kind,
        imageSource: resolvedImageSource,
        messageId: msgId
      });

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

            // O turno que confirmou a compra também deve aparecer como convertido
            // imediatamente no Lead Intelligence.
            v3Response.intelligence.temperature = "quente";
            v3Response.intelligence.intent = "Pós-venda";
            v3Response.intelligence.stage = "Pós-venda";
            v3Response.intelligence.purchase_probability = 100;
            v3Response.intelligence.recommended_action =
              `Cliente convertido. Potencial de recompra: ${customerMemory.repurchasePotential}.`;
          }
        } catch (memoryPersistError) {
          console.warn("[CUSTOMER-MEMORY] Falha ao atualizar memória comercial:", memoryPersistError);
        }
      }

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
              phoneStr,
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

          await uazapiSendAudio(creds, phoneStr, audioBase64);
          console.log("[AUDIO-V3] 5/5 nota de voz enviada pela Uazapi");
          await uazapiClearPresence(creds, phoneStr).catch(() => undefined);
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

        // Se outra mensagem do cliente chegou enquanto esta resposta estava sendo
        // preparada/humanizada, não envia uma resposta obsoleta para a metade anterior.
        if (conversationId && content.kind === "texto") {
          const { data: latestInbound } = await supabaseAdmin
            .from("messages")
            .select("body, created_at")
            .eq("conversation_id", conversationId)
            .eq("sender", "cliente")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          const latestBody = String((latestInbound as any)?.body || "").trim();
          if (latestBody && latestBody !== finalMsgText.trim() && !effectiveAgentMessage.endsWith(latestBody)) {
            console.log("[AGENT-V3] Resposta antiga suprimida: cliente enviou complemento");
            return new Response("ok (superseded by newer customer message)");
          }
        }

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
                await uazapiSendTyping(creds, phoneStr, partDelayMs).catch(() => undefined);
              }
              await sleepMs(partDelayMs);
            }
          }

          const sendResult = await sendAgentTextGuarded(
            creds,
            phoneStr,
            part,
            {
              conversationId: finalConvId,
              source: "agent_v3",
              applyHumanize: true,
              recentAgentBodiesOverride: [...recentAgentBodies, ...deliveredParts].slice(-3),
            },
          );
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
        { role: "customer" as const, content: finalMsgText },
        // Salva exatamente o texto que chegou ao cliente após humanização/emoji guard.
        { role: "agent" as const, content: deliveredReplyText },
      ].slice(-100);

      // Só persiste a resposta do agente depois que o envio foi confirmado.
      // Antes, uma falha no WhatsApp deixava o histórico afirmando que o cliente
      // recebeu uma resposta que nunca foi entregue.
      await saveConversationStateV3(
        num.user_id,
        phoneStr,
        nextHistory,
        workspaceId,
      );

      return new Response("ok (AI processed)");

      } catch (e: any) {
        console.error("[UAZ-WEBHOOK] AI Critical Error:", e?.message ?? e);

        // A mensagem do cliente já foi persistida no CRM antes deste ponto.
        // Não pedimos retry ao provedor para evitar uma segunda resposta, mas
        // também não deixamos a falha silenciosa: a conversa fica visível para
        // atendimento humano/revisão.
        if (conversationId) {
          const { error: reviewErr } = await supabaseAdmin
            .from("conversations")
            .update({
              needs_review: true,
              review_reason: "falha crítica no Agent V3",
            })
            .eq("id", conversationId);
          if (reviewErr) {
            console.error("[UAZ-WEBHOOK] Failed to flag AI error for review:", reviewErr);
          }
        }

        return new Response("ok (AI error flagged for review)");
      } finally {
        if (conversationId) {
          await releaseConversationDbLock(supabaseAdmin, conversationId, lockHolder);
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
