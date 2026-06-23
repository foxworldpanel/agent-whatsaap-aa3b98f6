import { createFileRoute } from "@tanstack/react-router";

// Uazapi webhook receiver.
// Configure em Uazapi → Webhooks: POST {site}/api/public/hooks/uazapi-webhook
// Eventos: messages (mensagens recebidas).

type UazapiPayload = {
  event?: string;
  EventType?: string;
  token?: string; // token da instância
  instance?: { token?: string } | string;
  message?: {
    chatid?: string;
    sender?: string;
    fromMe?: boolean;
    messageType?: string;
    type?: string;
    text?: string;
    content?: string;
    senderName?: string;
    mediaUrl?: string;
    // Meta Ads / WhatsApp Cloud referral fields (vários formatos possíveis)
    referral?: Record<string, unknown>;
    ctwa_clid?: string;
    sourceUrl?: string;
    sourceId?: string;
    sourceType?: string;
    contextInfo?: Record<string, unknown>;
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

function extractContent(p: UazapiPayload): { text: string; kind: "texto" | "audio" } {
  const m = p.message ?? p.data ?? {};
  const type = (m.messageType ?? m.type ?? "").toLowerCase();
  if (type.includes("audio") || type.includes("ptt")) {
    return { text: m.text || "[áudio recebido]", kind: "audio" };
  }
  return { text: m.text ?? m.content ?? "", kind: "texto" };
}

function extractMediaUrl(p: UazapiPayload): string | null {
  const m = p.message ?? p.data ?? {};
  return m.mediaUrl ?? null;
}

type LeadSource = {
  source: string;
  source_ref: string | null;
  source_url: string | null;
  source_headline: string | null;
  source_data: Record<string, unknown> | null;
};

function extractLeadSource(p: UazapiPayload): LeadSource | null {
  const m = (p.message ?? p.data ?? {}) as Record<string, unknown>;
  const ctx = (m.contextInfo as Record<string, unknown> | undefined) ?? {};
  const ref =
    (m.referral as Record<string, unknown> | undefined) ??
    (ctx.externalAdReply as Record<string, unknown> | undefined) ??
    (ctx.referral as Record<string, unknown> | undefined);

  const ctwa =
    (m.ctwa_clid as string | undefined) ??
    (ref?.ctwa_clid as string | undefined) ??
    (ctx.ctwa_clid as string | undefined);

  const sourceUrl =
    (m.sourceUrl as string | undefined) ??
    (ref?.source_url as string | undefined) ??
    (ref?.sourceUrl as string | undefined);

  const sourceId =
    (m.sourceId as string | undefined) ??
    (ref?.source_id as string | undefined) ??
    (ref?.sourceId as string | undefined);

  const sourceType =
    (m.sourceType as string | undefined) ??
    (ref?.source_type as string | undefined) ??
    (ref?.sourceType as string | undefined);

  const headline =
    (ref?.headline as string | undefined) ??
    (ref?.body as string | undefined) ??
    (ref?.title as string | undefined);

  const sourceRef = ctwa ?? sourceId ?? null;

  const isMeta =
    !!ctwa ||
    (typeof sourceType === "string" && /ad|fb|ig|meta/i.test(sourceType)) ||
    (typeof sourceUrl === "string" && /(fb\.me|facebook|instagram|fb\.com)/i.test(sourceUrl));

  if (!ref && !ctwa && !sourceUrl && !sourceId) return null;

  return {
    source: isMeta ? "meta_ads" : "organico",
    source_ref: sourceRef,
    source_url: sourceUrl ?? null,
    source_headline: headline ?? null,
    source_data: ref ?? { ctwa_clid: ctwa, sourceUrl, sourceId, sourceType },
  };
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

const FALLBACK_REPLY = "Deixa eu verificar aqui pra você 😊";

export const Route = createFileRoute("/api/public/hooks/uazapi-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: UazapiPayload;
        try {
          payload = (await request.json()) as UazapiPayload;
        } catch {
          return new Response("invalid json", { status: 400 });
        }

        const event = (payload.event ?? payload.EventType ?? "").toLowerCase();
        // Aceita messages, messages.upsert, message etc.
        if (event && !event.includes("message")) return new Response("ignored");

        const msg = payload.message ?? payload.data;
        if (!msg) return new Response("no message");
        if (msg.fromMe) return new Response("ignored: fromMe");

        const instanceToken = pickInstanceToken(payload);
        const phone = extractPhone(msg.chatid, msg.sender);
        if (!instanceToken || !phone) {
          return new Response("missing token/phone", { status: 400 });
        }

        const { text, kind } = extractContent(payload);
        const mediaUrl = extractMediaUrl(payload);
        if (!text && kind !== "audio") return new Response("empty");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: integ, error: intErr } = await supabaseAdmin
          .from("integrations")
          .select(
            "user_id, uazapi_url, uazapi_token, anthropic_api_key, elevenlabs_api_key, elevenlabs_voice_id",
          )
          .eq("uazapi_token", instanceToken)
          .maybeSingle();
        if (intErr) return new Response(intErr.message, { status: 500 });
        if (!integ) return new Response("instance not registered", { status: 404 });

        const userId = integ.user_id;

        let { data: contact } = await supabaseAdmin
          .from("contacts")
          .select("id, nome, perfil, status, source, source_ref")
          .eq("user_id", userId)
          .eq("telefone", phone)
          .maybeSingle();

        const leadSource = extractLeadSource(payload);

        if (!contact) {
          const inserted = await supabaseAdmin
            .from("contacts")
            .insert({
              user_id: userId,
              nome: msg.senderName ?? phone,
              telefone: phone,
              perfil: "frio",
              status: "em_conversa",
              source: leadSource?.source ?? "organico",
              source_ref: leadSource?.source_ref ?? null,
              source_url: leadSource?.source_url ?? null,
              source_headline: leadSource?.source_headline ?? null,
              source_data: (leadSource?.source_data ?? null) as never,
            })
            .select("id, nome, perfil, status, source, source_ref")
            .single();
          if (inserted.error) return new Response(inserted.error.message, { status: 500 });
          contact = inserted.data;
        } else if (leadSource && (contact.source === "organico" || !contact.source_ref)) {
          // Atualiza origem se chegou ref e ainda não havia
          await supabaseAdmin
            .from("contacts")
            .update({
              source: leadSource.source,
              source_ref: leadSource.source_ref,
              source_url: leadSource.source_url,
              source_headline: leadSource.source_headline,
              source_data: leadSource.source_data as never,
            })
            .eq("id", contact.id);
        }

        if (contact.status === "bloqueado") {
          return new Response("ok (blocked)");
        }

        let { data: conv } = await supabaseAdmin
          .from("conversations")
          .select("id")
          .eq("user_id", userId)
          .eq("contact_id", contact.id)
          .maybeSingle();

        if (!conv) {
          const insertedConv = await supabaseAdmin
            .from("conversations")
            .insert({
              user_id: userId,
              contact_id: contact.id,
              status: "agente_respondendo",
            })
            .select("id")
            .single();
          if (insertedConv.error) return new Response(insertedConv.error.message, { status: 500 });
          conv = insertedConv.data;
        }

        // Transcreve áudio antes de salvar (para o histórico já ir certo pro Claude)
        let inboundBody = text;
        if (kind === "audio" && mediaUrl) {
          try {
            const { transcribeAudioUrl } = await import("@/lib/ai.server");
            const transcript = await transcribeAudioUrl(mediaUrl);
            if (transcript) inboundBody = transcript;
          } catch (e) {
            console.error("transcribe failed", e);
          }
        }

        const now = new Date().toISOString();
        await supabaseAdmin.from("messages").insert({
          user_id: userId,
          conversation_id: conv.id,
          sender: "cliente",
          kind,
          body: inboundBody,
          audio_url: kind === "audio" ? mediaUrl : null,
        });
        await supabaseAdmin
          .from("conversations")
          .update({
            last_message_preview: inboundBody.slice(0, 120),
            last_message_at: now,
            status: "agente_respondendo",
          })
          .eq("id", conv.id);

        if (isStopRequest(inboundBody)) {
          await supabaseAdmin
            .from("contacts")
            .update({ status: "bloqueado", last_interaction_at: now })
            .eq("id", contact.id);
          await supabaseAdmin
            .from("conversations")
            .update({ status: "aguardando" })
            .eq("id", conv.id);
          return new Response("ok (stop → blocked)");
        }

        if (!integ.anthropic_api_key) return new Response("ok (no claude key)");

        const { data: agent } = await supabaseAdmin
          .from("agent_config")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle();
        if (!agent) return new Response("ok (no agent config)");

        const { data: history } = await supabaseAdmin
          .from("messages")
          .select("sender, body")
          .eq("conversation_id", conv.id)
          .order("created_at", { ascending: true })
          .limit(30);

        const { generateAgentReply } = await import("@/lib/ai.server");
        let reply: string;
        try {
          reply = await generateAgentReply({
            anthropicApiKey: integ.anthropic_api_key,
            agent,
            contact: { nome: contact.nome, perfil: contact.perfil },
            history: (history ?? []) as Array<{ sender: "agente" | "cliente"; body: string }>,
          });
          if (!reply || !reply.trim()) reply = FALLBACK_REPLY;
        } catch (e) {
          console.error("claude failed", e);
          reply = FALLBACK_REPLY;
        }

        // Se cliente mandou áudio e agente está com áudio ligado + ElevenLabs configurado → responde com áudio
        const respondWithAudio =
          kind === "audio" &&
          (agent as { audio_enabled?: boolean }).audio_enabled === true &&
          !!integ.elevenlabs_api_key &&
          !!integ.elevenlabs_voice_id;

        const { uazapiSendText, uazapiSendAudio } = await import("@/lib/uazapi.server");
        let replyKind: "texto" | "audio" = "texto";
        let audioDataUri: string | null = null;
        try {
          if (respondWithAudio) {
            const { ttsElevenLabsBase64 } = await import("@/lib/ai.server");
            audioDataUri = await ttsElevenLabsBase64({
              apiKey: integ.elevenlabs_api_key!,
              voiceId: integ.elevenlabs_voice_id!,
              text: reply,
            });
            await uazapiSendAudio(
              { uazapi_url: integ.uazapi_url ?? "", uazapi_token: integ.uazapi_token ?? "" },
              phone,
              audioDataUri,
            );
            replyKind = "audio";
          } else {
            await uazapiSendText(
              { uazapi_url: integ.uazapi_url ?? "", uazapi_token: integ.uazapi_token ?? "" },
              phone,
              reply,
            );
          }
        } catch (e) {
          return new Response(`uazapi send failed: ${(e as Error).message}`, { status: 502 });
        }

        const nowReply = new Date().toISOString();
        await supabaseAdmin.from("messages").insert({
          user_id: userId,
          conversation_id: conv.id,
          sender: "agente",
          kind: replyKind,
          body: reply,
          audio_url: audioDataUri,
        });
        await supabaseAdmin
          .from("conversations")
          .update({
            last_message_preview: reply.slice(0, 120),
            last_message_at: nowReply,
            status: "aguardando",
          })
          .eq("id", conv.id);
        await supabaseAdmin
          .from("contacts")
          .update({ last_interaction_at: nowReply, status: "em_conversa" })
          .eq("id", contact.id);

        return new Response("ok");
      },
    },
  },
});