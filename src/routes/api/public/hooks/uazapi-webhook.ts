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

    // Respeita os kill switches globais e por conversa. O recebimento continua
    // sincronizado no CRM, mas nenhuma resposta automática é gerada.
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

    if (!agentConfig || agentConfig.agent_enabled === false) {
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

      if (conversationGate?.agent_enabled === false || conversationGate?.needs_review === true) {
        return new Response("ok (agent disabled for conversation)");
      }
    }

    // 4. AI PROCESSING (V3)
    // O webhook já é protegido pelo token da instância provisionada.
    // Não limitar o agente a um telefone fixo de teste em produção.
    const lockKey = `${workspaceId}:${phoneStr}`;
    return await withConversationLock(lockKey, async () => {
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

      const replyText = v3Response.replies.join("\n\n");

      const nextHistory = [
        ...history,
        { role: "customer" as const, content: finalMsgText },
        { role: "agent" as const, content: replyText },
      ].slice(-100);

      const finalConvId = String(conversationId || phoneStr);

      const creds = { uazapi_url: num.uazapi_url ?? "", uazapi_token: instanceToken };
      let sentAsAudio = false;

      if (content.kind === "audio" && integ?.elevenlabs_api_key && integ?.elevenlabs_voice_id) {
        try {
          const { textToSpeechV3 } = await import("@/lib/agent-v3/integrations/audio-processor.server");
          const { uazapiSendAudio, uazapiSendRecording, uazapiClearPresence } = await import("@/lib/uazapi.server");
          await uazapiSendRecording(creds, phoneStr, 1200).catch(() => undefined);
          const audioBase64 = await textToSpeechV3({
            apiKey: integ.elevenlabs_api_key,
            voiceId: integ.elevenlabs_voice_id,
            text: replyText,
          });
          await uazapiSendAudio(creds, phoneStr, audioBase64);
          await uazapiClearPresence(creds, phoneStr).catch(() => undefined);
          sentAsAudio = true;
          console.log("[UAZ-WEBHOOK] Resposta do Agent V3 enviada por áudio");
        } catch (audioSendErr) {
          console.error("[UAZ-WEBHOOK] Falha ao responder por áudio; usando texto:", audioSendErr);
        }
      }

      if (!sentAsAudio) {
        await sendAgentTextGuarded(
          creds,
          phoneStr,
          replyText,
          {
            conversationId: finalConvId,
            source: "agent_v3",
            applyHumanize: true
          }
        );
      }

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
