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
    const { supabaseAdmin: adminEarly } = await import("@/integrations/supabase/client.server");
    const msgLocal = payload.message ?? payload.data ?? {};
    const phoneLocal = extractPhone(msgLocal.chatid, msgLocal.sender);
    const phoneStrLocal = String(phoneLocal || "");
    
    // 1. Bloqueio de mensagens enviadas pelo próprio bot (fromMe)
    if (msgLocal.fromMe) {
      console.log("[V3-GATE] Ignorando fromMe");
      return new Response("ok (ignoring self)");
    }

    // 2. Validação de número autorizado
    const AUTHORIZED_PHONES = ["5511970116430"];
    const isAuthorized = AUTHORIZED_PHONES.includes(phoneStrLocal);

    if (!isAuthorized) {
      const phoneTail = phoneStrLocal.slice(-4);
      console.log(`🚫 AI disabled for non-authorized contact (…${phoneTail})`);
      return new Response("ok (unauthorized number)");
    }

    // 3. Deduplicação por MessageID
    const msgId = extractMessageId(payload) || buildFallbackMessageId(phoneStrLocal, msgLocal.text || "");
    const hits = bumpMessageIdHit(msgId);
    if (hits > 1) {
      console.log(`[V3-GATE] Ignorando duplicata (msgId: ${msgId}, hit: ${hits})`);
      return new Response("ok (duplicate msgId)");
    }

    // [V3-ROUTING-GATE]
    const content = extractContent(payload);
    console.log(`[V3-AUDIT] ${JSON.stringify({ message_id: msgId, kind: content.kind, mime: content.mime || "none", media_url: !!content.mediaUrl })}`);
    
    try {
      const instanceToken = pickInstanceToken(payload);
      let finalMsgText = content.text;
      
      // 4. Processamento de áudio (Transcrição)
      let transcriptionAttempted = false;
      if (content.kind === "audio" && content.mediaUrl) {
        try {
          console.log("[V3-GATE] Áudio detectado, iniciando transcrição...");
          const { processAudioV3 } = await import("@/lib/agent-v3/audio-processor.server");
          const transcription = await processAudioV3(content.mediaUrl);
          if (transcription) {
            finalMsgText = transcription;
            transcriptionAttempted = true;
            console.log("[V3-GATE] Transcrição concluída:", finalMsgText);
          }
        } catch (audioErr) {
          console.error("[V3-GATE] Erro na transcrição:", audioErr);
        }
      }

      // 5. Proteção anti-envio duplicado (texto idêntico no TTL)
      if (memWasRecentlySent(phoneStrLocal, finalMsgText)) {
        console.log("[V3-GATE] Bloqueando reenvio de texto idêntico (TTL)");
        return new Response("ok (recently sent)");
      }

      // 6. Verificação de Stop Request (Compliance)
      if (isStopRequest(finalMsgText)) {
        console.log("[V3-GATE] Stop request detectado. Silenciando.");
        // Opcional: marcar no banco que o cliente pediu pra parar
        return new Response("ok (stop request)");
      }

      // Resolve contexto básico da instância
      const { data: num } = await adminEarly
        .from("whatsapp_numbers")
        .select("user_id, workspace_id, uazapi_url")
        .eq("uazapi_token", instanceToken || "")
        .maybeSingle();
      
      const targetUserId = num?.user_id || "f8da521a-e8db-4efe-8c9b-9bd69749c0a7";
      
      const { data: integ } = await adminEarly
        .from("integrations")
        .select("anthropic_api_key")
        .eq("user_id", targetUserId)
        .maybeSingle();

      const { runAgentV3Turn } = await import("@/lib/agent-v3/orchestrator.server");
      const { getConversationStateV3, saveConversationStateV3 } = await import("@/lib/agent-v3/conversation-state.server");

      // Carrega histórico V3
      const { history, telemetry: historyTelemetry } = await getConversationStateV3(targetUserId, phoneStrLocal);
      
      // Executa Orquestrador V3 (ÚNICO CAMINHO)
      const v3Response = await runAgentV3Turn({
        userId: targetUserId,
        message: finalMsgText,
        history: history,
        historyTelemetry: historyTelemetry,
        anthropicApiKey: integ?.anthropic_api_key || "",
        inputKind: content.kind,
        messageId: msgId
      });

      const replyText = v3Response.replies.join("\n\n");

      // Salva histórico V3
      await saveConversationStateV3(targetUserId, phoneStrLocal, [
        ...history,
        { role: "customer" as const, content: finalMsgText },
        { role: "agent" as const, content: replyText }
      ].slice(-100)); // Mantém um buffer maior no banco, mas o loader limita a 10 para o LLM

      // Busca ID da conversa para logs
      const { data: contactData } = await adminEarly
        .from("contacts")
        .select("id")
        .eq("user_id", targetUserId)
        .eq("telefone", phoneStrLocal)
        .maybeSingle();

      const { data: conv } = contactData ? await adminEarly
        .from("conversations")
        .select("id")
        .eq("contact_id", contactData.id)
        .maybeSingle() : { data: null };

      // Envio via canal seguro
      await sendAgentTextGuarded(
        { uazapi_url: num?.uazapi_url || "https://mindsmmglobal.uazapi.com", uazapi_token: instanceToken || "" },
        phoneStrLocal,
        replyText,
        { conversationId: conv?.id || phoneStrLocal, source: "agent_v3", applyHumanize: true }
      );

      // Marca como enviado recentemente para evitar loops
      memMarkSent(phoneStrLocal, replyText);

      console.log("[V3-GATE] Sucesso para:", phoneStrLocal, "kind:", content.kind, "transcribed:", transcriptionAttempted);
      return new Response("ok (V3 processed)");

    } catch (e: any) {
      console.error("[V3-CRITICAL-ERROR] Falha catastrófica:", e);
      
      const instanceToken = pickInstanceToken(payload);
      
      // Envia mensagem neutra de indisponibilidade
      await sendAgentTextGuarded(
        { uazapi_url: "https://mindsmmglobal.uazapi.com", uazapi_token: instanceToken || "" },
        phoneStrLocal,
        "Desculpe, tive um problema técnico momentâneo. Pode tentar de novo em instantes?",
        { conversationId: phoneStrLocal, source: "v3_error_fallback" }
      ).catch(() => {});
      
      return new Response("ok (V3 error handled - no V1 fallback)");
    }
}

export const Route = createFileRoute("/api/public/hooks/uazapi-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        let payload: UazapiPayload | null = null;
        try {
          payload = JSON.parse(rawBody) as UazapiPayload;
        } catch (e) {
          return new Response("invalid json", { status: 400 });
        }

        if (!payload) {
          return new Response("no payload", { status: 400 });
        }

        try {
          return await processWebhook(payload);
        } catch (e) {
          console.error("webhook process catched", e);
          return new Response("internal error", { status: 500 });
        }
      },
    },
  },
});