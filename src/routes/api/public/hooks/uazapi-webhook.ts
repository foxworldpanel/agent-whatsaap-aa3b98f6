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
    fromMe?: boolean;
    type?: string;
    messageType?: string;
    text?: string;
    content?: string;
    mediaUrl?: string;
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
    return { text: m.text || "[áudio recebido]", kind: "audio", mime, mediaUrl: m.mediaUrl };
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
  return m.messageid ?? m.messageId ?? m.id ?? null;
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

  const markStep = async (label: string) => {
    stepIndex += 1;
    const { error } = await (supabaseAdmin as any)
      .from("welcome_funnel_runs")
      .update({
        last_step: label,
        last_step_index: stepIndex,
        updated_at: new Date().toISOString(),
      })
      .eq("funnel_id", funnel.id)
      .eq("contact_id", contactId);
    if (error) console.warn("[WELCOME-FUNNEL] Falha ao atualizar progresso:", error);
  };

  const sendTextStep = async (
    key: "welcome_text" | "panel_text" | "services_text",
    source: string,
  ) => {
    const step = steps[key];
    const text = step?.text?.trim();
    if (!step?.enabled || !text) return;

    const delayMs = funnelStepDelayMs(step, funnel.delay_seconds);
    if (delayMs > 0) {
      await uazapiSendTyping(creds, phone, delayMs).catch(() => undefined);
      await sleepMs(delayMs);
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
    const delayMs = funnelStepDelayMs(steps.audio, funnel.delay_seconds);
    if (delayMs > 0) {
      await uazapiSendRecording(creds, phone, delayMs).catch(() => undefined);
      await sleepMs(delayMs);
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
    const delayMs = funnelStepDelayMs(steps.video, funnel.delay_seconds);
    if (delayMs > 0) {
      await uazapiSendTyping(creds, phone, delayMs).catch(() => undefined);
      await sleepMs(delayMs);
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
        .select("id")
        .single();

      if (contactErr) throw contactErr;
      if (contact?.id) contactId = contact.id;

      // Upsert Conversation
      if (contactId) {
        const { data: conv, error: convErr } = await supabaseAdmin
          .from("conversations")
          .upsert({
            contact_id: contactId,
            user_id: num.user_id,
            workspace_id: num.workspace_id,
            whatsapp_number_id: num.id,
            last_message_preview: content.text.slice(0, 100),
            last_message_at: new Date().toISOString(),
            status: msgLocal.fromMe ? "agente_respondendo" : "aguardando",
          }, { onConflict: "contact_id" })
          .select("id")
          .single();

        if (convErr) throw convErr;
        if (conv?.id) conversationId = conv.id;
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

    // 3.5. WELCOME FUNNEL — independente do liga/desliga do Agent V3.
    // O funil pertence ao número/campanha, não ao estado da IA. Assim, qualquer
    // contato que bater no gatilho recebe o funil completo. Depois, nas mensagens
    // seguintes, o Agent V3 só assume se as chaves global e individual estiverem ligadas.
    if (contactId && conversationId && content.kind === "texto") {
      const { data: runningFunnel, error: runningErr } = await (supabaseAdmin as any)
        .from("welcome_funnel_runs")
        .select("funnel_id, status, updated_at")
        .eq("contact_id", contactId)
        .eq("workspace_id", workspaceId)
        .eq("status", "running")
        .limit(1)
        .maybeSingle();

      if (runningErr) {
        console.error("[WELCOME-FUNNEL] Falha ao verificar execução ativa:", runningErr);
        return new Response("ok (funnel gate unavailable)");
      }

      if (runningFunnel) {
        const updatedAtMs = runningFunnel.updated_at
          ? new Date(runningFunnel.updated_at).getTime()
          : Date.now();
        const stale = Date.now() - updatedAtMs > 20 * 60 * 1000;

        if (!stale) {
          console.log("[WELCOME-FUNNEL] Funil ainda em execução; Agent V3 bloqueado neste turno");
          return new Response("ok (welcome funnel running)");
        }

        console.warn("[WELCOME-FUNNEL] Recuperando execução órfã com mais de 20 minutos");
        await (supabaseAdmin as any)
          .from("welcome_funnel_runs")
          .update({
            status: "failed",
            error_message: "execução órfã recuperada após 20 minutos",
            updated_at: new Date().toISOString(),
          })
          .eq("funnel_id", runningFunnel.funnel_id)
          .eq("contact_id", contactId)
          .eq("status", "running");
      }

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
        console.error("[WELCOME-FUNNEL] Falha ao carregar funis:", funnelErr);
        return new Response("ok (funnel load unavailable)");
      }

      const matchingFunnel = ((funnelRows || []) as WelcomeFunnelRow[]).find((row) =>
        funnelMatchesMessage(row.trigger_keywords, content.text),
      );

      if (matchingFunnel) {
        const { data: existingRun, error: existingRunErr } = await (supabaseAdmin as any)
          .from("welcome_funnel_runs")
          .select("status, fired_at")
          .eq("funnel_id", matchingFunnel.id)
          .eq("contact_id", contactId)
          .maybeSingle();

        if (existingRunErr) {
          console.error("[WELCOME-FUNNEL] Falha ao verificar histórico do funil:", existingRunErr);
          return new Response("ok (funnel history unavailable)");
        }

        const repeatForTest = canRepeatWelcomeFunnelForTest(phoneStr);

        // Clientes normais recebem o funil uma única vez.
        // O número pessoal de teste pode repetir o mesmo funil indefinidamente:
        // cada novo gatilho transforma o run completed em failed temporariamente,
        // permitindo que o fluxo de claim/retry existente execute novamente.
        if (repeatForTest && existingRun?.status === "completed") {
          const { error: resetTestRunErr } = await (supabaseAdmin as any)
            .from("welcome_funnel_runs")
            .update({
              status: "failed",
              completed_at: null,
              error_message: "reset automático para número de teste",
              last_step: null,
              last_step_index: 0,
              updated_at: new Date().toISOString(),
            })
            .eq("funnel_id", matchingFunnel.id)
            .eq("contact_id", contactId)
            .eq("status", "completed");

          if (resetTestRunErr) {
            console.error("[WELCOME-FUNNEL] Falha ao resetar run do número de teste:", resetTestRunErr);
            return new Response("ok (test funnel reset failed)");
          }

          existingRun.status = "failed";
        }

        if (!existingRun || existingRun.status === "failed") {
          // Claim atômico. A PK (funnel_id, contact_id) impede duas instâncias
          // de dispararem o mesmo funil ao mesmo tempo.
          let claimed = false;
          if (!existingRun) {
            const { error: claimErr } = await (supabaseAdmin as any)
              .from("welcome_funnel_runs")
              .insert({
                funnel_id: matchingFunnel.id,
                contact_id: contactId,
                user_id: num.user_id,
                workspace_id: workspaceId,
                status: "running",
                last_step: null,
                last_step_index: 0,
                fired_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              });
            if (!claimErr) claimed = true;
            else if (claimErr.code !== "23505") {
              console.error("[WELCOME-FUNNEL] Falha ao reservar execução:", claimErr);
              return new Response("ok (funnel claim failed)");
            }
          } else {
            const { data: retryClaim, error: retryClaimErr } = await (supabaseAdmin as any)
              .from("welcome_funnel_runs")
              .update({
                status: "running",
                error_message: null,
                last_step: null,
                last_step_index: 0,
                fired_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("funnel_id", matchingFunnel.id)
              .eq("contact_id", contactId)
              .eq("status", "failed")
              .select("funnel_id")
              .maybeSingle();
            if (retryClaimErr) {
              console.error("[WELCOME-FUNNEL] Falha ao reservar retry:", retryClaimErr);
              return new Response("ok (funnel retry claim failed)");
            }
            claimed = !!retryClaim;
          }

          if (claimed) {
            const creds = { uazapi_url: num.uazapi_url ?? "", uazapi_token: instanceToken };
            try {
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

              const { error: completeErr } = await (supabaseAdmin as any)
                .from("welcome_funnel_runs")
                .update({
                  status: "completed",
                  completed_at: new Date().toISOString(),
                  error_message: null,
                  updated_at: new Date().toISOString(),
                })
                .eq("funnel_id", matchingFunnel.id)
                .eq("contact_id", contactId);

              if (completeErr) {
                console.error("[WELCOME-FUNNEL] Funil enviado, mas falhou ao marcar completo:", completeErr);
              }

              console.log(`[WELCOME-FUNNEL] Funil "${matchingFunnel.name}" concluído; Agent V3 assume nas próximas mensagens`);
              return new Response("ok (welcome funnel completed)");
            } catch (funnelSendErr) {
              console.error("[WELCOME-FUNNEL] Falha durante envio:", funnelSendErr);
              await (supabaseAdmin as any)
                .from("welcome_funnel_runs")
                .update({
                  status: "failed",
                  error_message: String(
                    funnelSendErr instanceof Error ? funnelSendErr.message : funnelSendErr,
                  ).slice(0, 1000),
                  updated_at: new Date().toISOString(),
                })
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
              return new Response("ok (welcome funnel failed; flagged for review)");
            }
          }

          // Outra instância ganhou o claim. Não deixe a IA responder junto.
          return new Response("ok (welcome funnel claimed elsewhere)");
        }

        // completed = este contato já recebeu este funil; segue normalmente para o V3.
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

      let finalMsgText = content.text || "";
      if (content.kind === "audio") {
        if (!content.mediaUrl || !integ?.openai_api_key) {
          console.error("[UAZ-WEBHOOK] Audio received without media URL or OpenAI key");
          if (conversationId) {
            const { error: reviewErr } = await supabaseAdmin
              .from("conversations")
              .update({
                needs_review: true,
                review_reason: !content.mediaUrl
                  ? "áudio recebido sem URL de mídia"
                  : "áudio recebido sem chave OpenAI para transcrição",
              })
              .eq("id", conversationId);
            if (reviewErr) {
              console.error("[UAZ-WEBHOOK] Failed to flag unavailable audio for review:", reviewErr);
            }
          }
          return new Response("ok (audio unavailable; flagged for review)");
        }

        try {
          const { processAudioV3 } = await import("@/lib/agent-v3/integrations/audio-processor.server");
          const transcription = await processAudioV3(content.mediaUrl, integ.openai_api_key);
          finalMsgText = transcription?.trim() || "";
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

      if (!finalMsgText.trim()) {
        return new Response("ok (empty content)");
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

      const { data: humanizationRow, error: humanizationError } = await (supabaseAdmin as any)
        .from("agent_humanization_settings")
        .select("*")
        .eq("workspace_id", workspaceId)
        .maybeSingle();

      if (humanizationError) {
        console.warn("[UAZ-WEBHOOK] Falha ao carregar configuração de humanização; usando padrão:", humanizationError);
      }

      const humanization = normalizeHumanizationSettings(
        humanizationRow || DEFAULT_AGENT_HUMANIZATION,
      );
      const creds = { uazapi_url: num.uazapi_url ?? "", uazapi_token: instanceToken };

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

      const v3Response = await runAgentV3Turn({
        userId: num.user_id,
        workspaceId,
        conversationId: conversationId ?? undefined,
        phone: phoneStr,
        message: finalMsgText,
        history: history,
        historyTelemetry: historyTelemetry,
        anthropicApiKey: integ?.anthropic_api_key || "",
        inputKind: content.kind,
        messageId: msgId
      });

      const replyParts = v3Response.replies.length > 0 ? v3Response.replies : [v3Response.response];
      const replyText = replyParts.join("\n\n");

      const finalConvId = String(conversationId || phoneStr);

      const targetHumanDelayMs = calculateHumanResponseTargetMs(replyText, humanization);
      const elapsedBeforeDeliveryMs = Date.now() - inboundStartedAt;
      const remainingFirstReplyDelayMs = Math.max(
        0,
        targetHumanDelayMs - elapsedBeforeDeliveryMs,
      );

      let sentAsAudio = false;
      let deliveredReplyText = replyText;

      if (content.kind === "audio" && integ?.elevenlabs_api_key && integ?.elevenlabs_voice_id) {
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
            apiKey: integ.elevenlabs_api_key,
            voiceId: integ.elevenlabs_voice_id,
            text: replyText,
          });

          // O tempo de geração do Claude/TTS conta como parte da espera humana.
          const remainingAudioDelayMs = Math.max(
            0,
            targetHumanDelayMs - (Date.now() - inboundStartedAt),
          );
          await sleepMs(remainingAudioDelayMs);

          await uazapiSendAudio(creds, phoneStr, audioBase64);
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

      if (!sentAsAudio) {
        const recentAgentBodies = history
          .filter((item) => item.role === "agent")
          .map((item) => item.content)
          .slice(-3);
        const deliveredParts: string[] = [];

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
