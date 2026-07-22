import { createFileRoute } from "@tanstack/react-router";
import { sendAgentTextGuarded } from "@/lib/send-agent-guarded.server";

// Uazapi webhook receiver.
// Configure em Uazapi → Webhooks: POST {site}/api/public/hooks/uazapi-webhook
// Eventos: messages (mensagens recebidas).

// Trava anti-duplicata em memória (TTL 10s).
const RECENT_SEND_TTL_MS = 10_000;
const recentSendsMem = new Map<string, number>();
function recentSendKey(phone: string, body: string): string {
  return `sent:${phone}:${(body ?? "").slice(0, 20)}`;
}
function memWasRecentlySent(phone: string, body: string): boolean {
  const key = recentSendKey(phone, body);
  const expiry = recentSendsMem.get(key);
  const now = Date.now();
  if (expiry && expiry > now) return true;
  // GC oportunista
  if (recentSendsMem.size > 500) {
    for (const [k, v] of recentSendsMem) if (v <= now) recentSendsMem.delete(k);
  }
  return false;
}
function memMarkSent(phone: string, body: string): void {
  recentSendsMem.set(recentSendKey(phone, body), Date.now() + RECENT_SEND_TTL_MS);
}

// Contador em memória por messageId
const messageIdHits = new Map<string, number>();
function bumpMessageIdHit(id: string): number {
  const n = (messageIdHits.get(id) ?? 0) + 1;
  messageIdHits.set(id, n);
  if (messageIdHits.size > 1000) {
    const keys = Array.from(messageIdHits.keys()).slice(0, messageIdHits.size - 500);
    for (const k of keys) messageIdHits.delete(k);
  }
  return n;
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
  /\bpare\b/i,
  /\bparar\b/i,
  /\bn[aã]o\s+quero\b/i,
  /\bn[aã]o\s+me\s+(mande|manda|envie|mand)/i,
  /\bsai[ar]?\s+da\s+lista\b/i,
  /\bdescadastr/i,
  /\bme\s+tira\b/i,
  /\bstop\b/i,
  /\bunsubscribe\b/i,
  /\bcancelar?\b/i,
];

function isStopRequest(text: string): boolean {
  if (!text) return false;
  return STOP_PATTERNS.some((re) => re.test(text));
}

async function processWebhook(payload: UazapiPayload): Promise<Response> {
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

    // 1. Deduplicação por MessageID
    const extractedId = extractMessageId(payload);
    const msgId: string = extractedId ?? buildFallbackMessageId(phoneStr, msgLocal.text ?? "");
    
    const hits = bumpMessageIdHit(msgId);
    if (hits > 1) {
      console.log(`[UAZ-WEBHOOK] Ignorando duplicata (msgId: ${msgId}, hit: ${hits})`);
      return new Response("ok (duplicate msgId)");
    }

    const content = extractContent(payload);

    // 2. SYNC TO CRM (Always do this for all incoming messages)
    let contactId: string | undefined = undefined;
    let conversationId: string | undefined = undefined;

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
      if (conversationId) {
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

        if (msgErr) throw msgErr;
      }
    } catch (syncErr: any) {
      console.error("[UAZ-WEBHOOK] Error syncing to CRM:", syncErr.message);
    }

    // 3. AI GATE
    if (msgLocal.fromMe) {
      return new Response("ok (sync only for fromMe)");
    }

    const AUTHORIZED_PHONES = ["5511970116430"];
    const isAuthorized = AUTHORIZED_PHONES.includes(phoneStr);

    if (!isAuthorized) {
      console.log(`[UAZ-WEBHOOK] AI disabled for …${phoneStr.slice(-4)}`);
      return new Response("ok (sync only)");
    }

    // 4. AI PROCESSING (V3)
    try {
      let finalMsgText = content.text || "";
      if (content.kind === "audio" && content.mediaUrl) {
        try {
          const { processAudioV3 } = await import("@/lib/agent-v3/integrations/audio-processor.server");
          const transcription = await processAudioV3(content.mediaUrl);
          if (transcription) finalMsgText = transcription;
        } catch (audioErr) {
          console.error("[UAZ-WEBHOOK] Transcription failed:", audioErr);
        }
      }

      if (memWasRecentlySent(phoneStr, finalMsgText)) {
        return new Response("ok (recently sent)");
      }

      if (isStopRequest(finalMsgText)) {
        return new Response("ok (stop request)");
      }

      const { data: integ } = await supabaseAdmin
        .from("integrations")
        .select("anthropic_api_key")
        .eq("user_id", num.user_id)
        .maybeSingle();

      const { runAgentV3Turn } = await import("@/lib/agent-v3/orchestrator.server");
      const { getConversationStateV3, saveConversationStateV3 } = await import("@/lib/agent-v3/memory/conversation-state.server");

      const { history, telemetry: historyTelemetry } = await getConversationStateV3(num.user_id, phoneStr);

      const v3Response = await runAgentV3Turn({
        userId: num.user_id,
        workspaceId: num.workspace_id ?? undefined,
        conversationId: conversationId ?? undefined,
        phone: phoneStr,
        message: finalMsgText,
        history: history,
        historyTelemetry: historyTelemetry,
        anthropicApiKey: integ?.anthropic_api_key || "",
        inputKind: content.kind,
        messageId: msgId
      });

      const replyText = v3Response.replies.join("\n\n");

      await saveConversationStateV3(num.user_id, phoneStr, [
        ...history,
        { role: "customer" as const, content: finalMsgText },
        { role: "agent" as const, content: replyText }
      ].slice(-100));

      const finalConvId = String(conversationId || phoneStr);

      await sendAgentTextGuarded(
        { uazapi_url: num.uazapi_url, uazapi_token: instanceToken },
        phoneStr,
        replyText,
        { 
          conversationId: finalConvId, 
          source: "agent_v3", 
          applyHumanize: true 
        }
      );

      memMarkSent(phoneStr, replyText);
      return new Response("ok (AI processed)");

    } catch (e: any) {
      console.error("[UAZ-WEBHOOK] AI Critical Error:", e.message);
      return new Response("ok (AI error handled)");
    }
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
