import { createFileRoute } from "@tanstack/react-router";

// Uazapi webhook receiver.
// Configure em Uazapi → Webhooks: POST {site}/api/public/hooks/uazapi-webhook
// Eventos: messages (mensagens recebidas).

// Trava anti-duplicata em memória (TTL 10s). Bloqueia reenvio do mesmo
// texto para o mesmo telefone dentro da janela, mesmo que o webhook seja
// chamado em paralelo antes da mensagem anterior ter sido persistida.
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

type UazapiPayload = {
  event?: string;
  EventType?: string;
  token?: string; // token da instância
  instance?: { token?: string } | string;
  message?: {
    chatid?: string;
    sender?: string;
    messageid?: string;
    messageId?: string;
    id?: string;
    fromMe?: boolean;
    messageType?: string;
    type?: string;
    text?: string;
    content?: string;
    senderName?: string;
    mediaUrl?: string;
    mimetype?: string;
    mediaType?: string;
    audioMessage?: unknown;
    pttMessage?: unknown;
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
  const type = (m.messageType ?? m.type ?? m.mediaType ?? "").toLowerCase();
  const mime = (m.mimetype ?? "").toLowerCase();
  const isAudio =
    type.includes("audio") ||
    type.includes("ptt") ||
    type.includes("voice") ||
    mime.startsWith("audio/") ||
    !!m.audioMessage ||
    !!m.pttMessage;
  console.log("🔎 extractContent type:", { type, mime, isAudio, hasAudioMessage: !!m.audioMessage, hasPttMessage: !!m.pttMessage });
  if (isAudio) {
    return { text: m.text || "[áudio recebido]", kind: "audio" };
  }
  return { text: m.text ?? m.content ?? "", kind: "texto" };
}

function extractMediaUrl(p: UazapiPayload): string | null {
  const m = p.message ?? p.data ?? {};
  return m.mediaUrl ?? null;
}

function extractMessageId(p: UazapiPayload): string | null {
  const m = p.message ?? p.data ?? {};
  return m.messageid ?? m.messageId ?? m.id ?? null;
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

function normalizeText(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function isDirectClientQuestion(text: string): boolean {
  const t = normalizeText(text ?? "");
  return /\?/.test(t) || /\b(qual|quais|quem|quanto|como|quando|onde|preco|valor|custa|servico|prazo|link|cadastro|pagamento|pix|seu nome|sua nome|voce se chama|te chama)\b/.test(t);
}

const FALLBACK_REPLY = "Deixa eu verificar aqui pra você 😊";

// ===== Detecção de conversa improdutiva =====
// Palavras relacionadas ao negócio (SMM / redes sociais / compra).
const SMM_KEYWORDS = [
  "view","views","like","likes","seguidor","seguidores","follower","followers","curtida","curtidas",
  "inscrito","inscritos","play","plays","comentario","comentarios","comment","comments",
  "instagram","insta","ig","tiktok","tik tok","youtube","yt","spotify","facebook","twitter","x ","kwai",
  "reel","reels","video","videos","short","shorts","story","stories","perfil","conta","canal","musica","musicas","faixa",
  "preco","valor","valores","custa","custo","quanto","quanta","pacote","pacotes","servico","servicos","catalogo","cardapio",
  "comprar","compra","comprei","quero","gostaria","pix","pagamento","pagar","saldo","cadastro","cadastrar","login","painel","site",
  "teste","gratis","trial","amostra","entrega","entregar","prazo","minimo","maximo","link","url",
  "ola","oi","bom dia","boa tarde","boa noite","obrigado","obrigada","valeu","fechado","beleza","top",
];
const ONE_WORD_FILLER = new Set([
  "ok","okay","oi","ola","hm","hmm","hum","rs","rsrs","kkk","kkkk","kkkkk","haha","hahaha",
  "ah","ahh","aff","eita","sla","blz","ata","aham","uhum","sim","nao","não","tá","ta","ok!",
]);
const OFFENSIVE_RE = /\b(idiota|burro|burra|imbecil|otario|otaria|otário|otária|babaca|merda|porra|caralho|fdp|filho da puta|vai se foder|cuzao|cuzão|viado|viad[oa]|puta|puto|arrombad[oa]|desgracad[oa]|desgraçad[oa]|escroto|escrota|cretin[oa]|retardad[oa])\b/i;

function isFillerSingleWord(body: string): boolean {
  const t = normalizeText((body ?? "").trim());
  if (!t) return false;
  if (t.length > 8) return false;
  if (/\s/.test(t)) return false;
  return ONE_WORD_FILLER.has(t) || /^(k+|h+a+|r+s+)$/.test(t);
}
function isOnTopic(body: string): boolean {
  const t = normalizeText(body ?? "");
  if (!t.trim()) return false;
  if (/\d/.test(t)) return true; // números (qtd / preço) costumam ser pertinentes
  if (/https?:\/\/|\.com|\.br|@\w/i.test(body)) return true;
  return SMM_KEYWORDS.some((k) => t.includes(k));
}
function detectUnproductive(
  clientMsgs: Array<{ body: string; kind: string }>,
  currentText: string,
  currentKind: "texto" | "audio",
): { reason: string } | null {
  // 1) Ofensa / xingamento — bloqueio imediato.
  if (OFFENSIVE_RE.test(currentText ?? "")) {
    return { reason: "Mensagem ofensiva detectada" };
  }
  // Junta a mensagem atual ao histórico recente (mais antiga → mais nova).
  const recent = [...clientMsgs.slice(-6), { body: currentText ?? "", kind: currentKind }];
  // 2) Filler de uma palavra repetido (ok, oi, hm, kkk…) 4x+ seguidas.
  const fillerStreak = recent.slice(-5).filter((m) => m.kind === "texto" && isFillerSingleWord(m.body)).length;
  if (fillerStreak >= 4) {
    return { reason: "Respostas curtas repetidas sem contexto" };
  }
  // 3) Spam de figurinhas / áudios curtos sem texto.
  const last5 = recent.slice(-5);
  const noisy = last5.filter(
    (m) => m.kind === "sticker" || m.kind === "image" || (m.kind === "audio" && (m.body ?? "[áudio recebido]") === "[áudio recebido]"),
  ).length;
  if (last5.length >= 4 && noisy >= 4) {
    return { reason: "Spam de figurinhas/áudios sem contexto" };
  }
  // 4) 3 mensagens seguidas de texto sem relação com SMM.
  const last3Text = recent.filter((m) => m.kind === "texto" && (m.body ?? "").trim().length > 0).slice(-3);
  if (last3Text.length >= 3 && last3Text.every((m) => !isOnTopic(m.body))) {
    return { reason: "3 mensagens seguidas fora do contexto de SMM/compra" };
  }
  return null;
}

export const Route = createFileRoute("/api/public/hooks/uazapi-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Lê o RAW body PRIMEIRO para garantir o dump mesmo se algo abaixo quebrar.
        const rawBody = await request.text();
        console.log("📦 PAYLOAD_RAW:", rawBody.slice(0, 1000));

        let payload: UazapiPayload | null = null;
        try {
          payload = JSON.parse(rawBody) as UazapiPayload;
        } catch {
          payload = null;
        }

        // Persiste o RAW no banco AGUARDANDO o insert (sem fire-and-forget),
        // usando supabaseAdmin para bypassar RLS. Quando o token permite,
        // grava também o user_id para aparecer na tela de Logs do dono.
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const msgForRawLog = payload?.message ?? payload?.data;
          const tokenForRawLog = payload ? pickInstanceToken(payload) : null;
          let userIdForRawLog: string | null = null;
          if (tokenForRawLog) {
            const { data: num } = await supabaseAdmin
              .from("whatsapp_numbers")
              .select("user_id")
              .eq("uazapi_token", tokenForRawLog)
              .order("updated_at", { ascending: false, nullsFirst: false })
              .limit(1)
              .maybeSingle();
            userIdForRawLog = num?.user_id ?? null;
            if (!userIdForRawLog) {
              const { data: integ } = await supabaseAdmin
                .from("integrations")
                .select("user_id")
                .eq("uazapi_token", tokenForRawLog)
                .order("updated_at", { ascending: false, nullsFirst: false })
                .limit(1)
                .maybeSingle();
              userIdForRawLog = integ?.user_id ?? null;
            }
          }
          const { error: rawLogError } = await supabaseAdmin.from("agent_logs").insert({
            user_id: userIdForRawLog,
            phone: extractPhone(msgForRawLog?.chatid, msgForRawLog?.sender) ?? "debug",
            type: "message_received",
            level: "info",
            summary: `PAYLOAD: ${rawBody.slice(0, 800)}`,
            metadata: { raw: rawBody.slice(0, 800) } as never,
            created_at: new Date().toISOString(),
          });
          if (rawLogError) console.error("PAYLOAD_RAW agent_logs insert failed:", rawLogError);
        } catch (e) {
          console.error("PAYLOAD_RAW agent_logs insert threw:", e);
        }

        if (!payload) {
          return new Response("invalid json", { status: 400 });
        }
        // IMPORTANTE: o runtime Cloudflare termina a execução assim que
        // respondemos. `request.waitUntil` não existe nesse handler — sem
        // executionCtx acessível, o trabalho em background era cortado e o
        // agente parava de responder. Aguardamos a execução completa antes
        // de devolver 200. O delay humanizado é limitado para caber dentro
        // do timeout do Uazapi (~60s).
        try {
          await processWebhook(payload);
        } catch (e) {
          console.error("webhook processing failed", e);
        }
        return new Response("ok");
      },
    },
  },
});

async function processWebhook(payload: UazapiPayload): Promise<Response> {

        const event = (payload.event ?? payload.EventType ?? "").toLowerCase();
        // 🔬 RAW payload dump (primeiros 1000 chars) para diagnosticar o formato real do Uazapi.
        try {
          const raw = JSON.stringify(payload).slice(0, 1000);
          console.log("📦 Payload RAW:", raw);
          const phoneForLog = extractPhone(payload.message?.chatid, payload.message?.sender) ?? "unknown";
          const { logEvent } = await import("@/lib/agent-logger.server");
          await logEvent({ phone: phoneForLog, type: "message_received", level: "info", summary: `📦 Payload RAW: ${raw.slice(0, 300)}`, metadata: { raw } });
        } catch (e) {
          console.error("raw payload log failed", e);
        }
        // Aceita messages, messages.upsert, message etc.
        if (event && !event.includes("message")) return new Response("ignored");

        const msg = payload.message ?? payload.data;
        if (!msg) return new Response("no message");
        const outbound = msg.fromMe === true;

        const instanceToken = pickInstanceToken(payload);
        const phone = extractPhone(msg.chatid, msg.sender);
        if (!instanceToken || !phone) {
          return new Response("missing token/phone", { status: 400 });
        }

        const { text, kind } = extractContent(payload);
        console.log('=== INÍCIO DO PROCESSAMENTO ===');
        console.log('Mensagem recebida:', { text, kind, phone: extractPhone(payload.message?.chatid, payload.message?.sender), messageId: extractMessageId(payload) });
        try {
          const { logEvent } = await import("@/lib/agent-logger.server");
          await logEvent({ phone: extractPhone(payload.message?.chatid, payload.message?.sender), type: "message_received", level: "info", summary: `📩 Mensagem recebida (${kind}): ${(text ?? "").slice(0, 80)}`, metadata: { kind, messageId: extractMessageId(payload) } });
        } catch {}
        let mediaUrl = extractMediaUrl(payload);
        const messageId = extractMessageId(payload);
        if (!text && kind !== "audio") return new Response("empty");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // ===== Idempotência por messageId =====
        // Uazapi às vezes dispara o mesmo evento mais de uma vez. Trava
        // definitiva: tenta inserir o messageId na tabela processed_messages
        // (PK). Se o insert falhar por conflito → já foi processado, ignora.
        if (messageId) {
          const { error: dupErr } = await supabaseAdmin
            .from("processed_messages")
            .insert({ message_id: messageId });
          if (dupErr) {
            // 23505 = unique_violation
            const code = (dupErr as { code?: string }).code;
            if (code === "23505" || /duplicate key/i.test(dupErr.message)) {
              console.log(`Mensagem duplicada bloqueada (processed_messages): ${messageId}`);
              try {
                const { logEvent } = await import("@/lib/agent-logger.server");
                await logEvent({ phone, type: "duplicate_blocked", level: "warn", summary: `Mensagem duplicada bloqueada (${messageId})`, metadata: { messageId } });
              } catch {}
              return new Response("ok (duplicate messageId)");
            }
            // erro inesperado: loga e segue (não bloqueia o atendimento)
            console.warn("processed_messages insert error:", dupErr.message);
          }
          // Fallback adicional: se já existe uma mensagem com esse external_id,
          // também ignora (cobre runs anteriores à criação da tabela).
          const { data: dupInbound } = await supabaseAdmin
            .from("messages")
            .select("id")
            .eq("external_id", messageId)
            .limit(1)
            .maybeSingle();
          if (dupInbound) {
            console.log(`Mensagem duplicada bloqueada: ${messageId}`);
            return new Response("ok (duplicate messageId)");
          }
        }

        // Trava anti-duplicata: evita reenviar para o mesmo número um texto
        // idêntico ao último enviado pelo agente nos últimos 5 segundos.
        const wasRecentlySent = async (conversationId: string, body: string): Promise<boolean> => {
          const fiveSecAgo = new Date(Date.now() - 5000).toISOString();
          const { data } = await supabaseAdmin
            .from("messages")
            .select("id")
            .eq("conversation_id", conversationId)
            .eq("sender", "agente")
            .eq("body", body)
            .gte("created_at", fiveSecAgo)
            .limit(1)
            .maybeSingle();
          if (data) {
            console.log(`Mensagem duplicada bloqueada: ${messageId ?? "(sem id)"} → "${body.slice(0, 60)}"`);
            return true;
          }
          return false;
        };

        // Resolve o número pelo token — primeiro em whatsapp_numbers (novo),
        // depois cai em integrations (legacy) caso o usuário ainda não tenha migrado.
        const { data: number } = await supabaseAdmin
          .from("whatsapp_numbers")
          .select("id, user_id, uazapi_url, meta_ads_enabled, disparos_mode")
          .eq("uazapi_token", instanceToken)
          .order("updated_at", { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle();

        let userId: string;
        let numberId: string | null = null;
        let numberUazapiUrl: string | null = null;
        let metaAdsEnabled = false;
        let disparosMode = false;

        if (number) {
          userId = number.user_id;
          numberId = number.id;
          numberUazapiUrl = number.uazapi_url;
          metaAdsEnabled = !!number.meta_ads_enabled;
          disparosMode = !!number.disparos_mode;
        } else {
          const { data: integLegacy, error: intErr } = await supabaseAdmin
            .from("integrations")
            .select("user_id, uazapi_url")
            .eq("uazapi_token", instanceToken)
            .order("updated_at", { ascending: false, nullsFirst: false })
            .limit(1)
            .maybeSingle();
          if (intErr) return new Response(intErr.message, { status: 500 });
          if (!integLegacy) return new Response("instance not registered", { status: 404 });
          userId = integLegacy.user_id;
          numberUazapiUrl = integLegacy.uazapi_url;
        }

        // Carrega config completa do dono do número (chaves de API, SMM, teste grátis)
        const { data: integ, error: intLoadErr } = await supabaseAdmin
          .from("integrations")
          .select(
            "user_id, uazapi_url, uazapi_token, anthropic_api_key, openai_api_key, elevenlabs_api_key, elevenlabs_voice_id, smm_api_key, smm_service_id, smm_panel_url, free_trial_enabled",
          )
          .eq("user_id", userId)
          .maybeSingle();
        if (intLoadErr) return new Response(intLoadErr.message, { status: 500 });
        if (!integ) return new Response("integration missing for user", { status: 404 });
        console.log(
          `🔑 Config agente carregada: elevenlabs_key=${integ.elevenlabs_api_key ? "tem" : "não tem"} | voice_id=${integ.elevenlabs_voice_id ? "tem" : "não tem"} | user_id=${userId}`,
        );

        let { data: contact } = await supabaseAdmin
          .from("contacts")
          .select("id, nome, perfil, status, source, source_ref, photo_url, whatsapp_number_id")
          .eq("user_id", userId)
          .eq("telefone", phone)
          .maybeSingle();

        const leadSource = extractLeadSource(payload);
        // Toggle "Receber leads Meta Ads": força marcar contatos novos como meta_ads
        const effectiveSource = metaAdsEnabled
          ? {
              source: "meta_ads",
              source_ref: leadSource?.source_ref ?? null,
              source_url: leadSource?.source_url ?? null,
              source_headline: leadSource?.source_headline ?? null,
              source_data: leadSource?.source_data ?? null,
            }
          : leadSource;

        if (!contact) {
          let photoUrl: string | null = null;
          try {
            const { uazapiGetProfilePic } = await import("@/lib/uazapi.server");
            if (numberUazapiUrl) {
              photoUrl = await uazapiGetProfilePic(
                { uazapi_url: numberUazapiUrl, uazapi_token: instanceToken },
                phone,
              );
            }
          } catch {}
          const inserted = await supabaseAdmin
            .from("contacts")
            .insert({
              user_id: userId,
              nome: msg.senderName ?? phone,
              telefone: phone,
              perfil: "frio",
              status: "em_conversa",
              source: effectiveSource?.source ?? "organico",
              source_ref: effectiveSource?.source_ref ?? null,
              source_url: effectiveSource?.source_url ?? null,
              source_headline: effectiveSource?.source_headline ?? null,
              source_data: (effectiveSource?.source_data ?? null) as never,
              photo_url: photoUrl,
              whatsapp_number_id: numberId,
            })
            .select("id, nome, perfil, status, source, source_ref, photo_url, whatsapp_number_id")
            .single();
          if (inserted.error) return new Response(inserted.error.message, { status: 500 });
          contact = inserted.data;
        } else {
          if (effectiveSource && (contact.source === "organico" || !contact.source_ref)) {
          // Atualiza origem se chegou ref e ainda não havia
          await supabaseAdmin
            .from("contacts")
            .update({
              source: effectiveSource.source,
              source_ref: effectiveSource.source_ref,
              source_url: effectiveSource.source_url,
              source_headline: effectiveSource.source_headline,
              source_data: effectiveSource.source_data as never,
            })
            .eq("id", contact.id);
          }
          if (!contact.whatsapp_number_id && numberId) {
            await supabaseAdmin
              .from("contacts")
              .update({ whatsapp_number_id: numberId })
              .eq("id", contact.id);
          }
          if (!contact.photo_url) {
            try {
              const { uazapiGetProfilePic } = await import("@/lib/uazapi.server");
              if (numberUazapiUrl) {
                const photoUrl = await uazapiGetProfilePic(
                  { uazapi_url: numberUazapiUrl, uazapi_token: instanceToken },
                  phone,
                );
                if (photoUrl) {
                  await supabaseAdmin
                    .from("contacts")
                    .update({ photo_url: photoUrl })
                    .eq("id", contact.id);
                }
              }
            } catch {}
          }
        }

        if (contact.status === "bloqueado") {
          return new Response("ok (blocked)");
        }

        let { data: conv } = await supabaseAdmin
          .from("conversations")
          .select("id, agent_enabled, whatsapp_number_id")
          .eq("user_id", userId)
          .eq("contact_id", contact.id)
          .maybeSingle();

        const isFirstContact = !conv;

        if (!conv) {
          const insertedConv = await supabaseAdmin
            .from("conversations")
            .insert({
              user_id: userId,
              contact_id: contact.id,
              status: "agente_respondendo",
              whatsapp_number_id: numberId,
            })
            .select("id, agent_enabled, whatsapp_number_id")
            .single();
          if (insertedConv.error) return new Response(insertedConv.error.message, { status: 500 });
          conv = insertedConv.data;
        } else if (!conv.whatsapp_number_id && numberId) {
          await supabaseAdmin
            .from("conversations")
            .update({ whatsapp_number_id: numberId })
            .eq("id", conv.id);
        }


        // Transcreve áudio antes de salvar (para o histórico já ir certo pro Claude)
        let inboundBody = text;
        if (kind === "audio" && !mediaUrl && messageId) {
          try {
            const { uazapiDownloadMedia } = await import("@/lib/uazapi.server");
            const downloaded = await uazapiDownloadMedia(
              { uazapi_url: numberUazapiUrl ?? integ.uazapi_url ?? "", uazapi_token: instanceToken },
              messageId,
            );
            if (downloaded.fileURL) mediaUrl = downloaded.fileURL;
            if (downloaded.transcription) inboundBody = downloaded.transcription;
          } catch (e) {
            console.error("uazapi media download failed", e);
          }
        }
        if (kind === "audio" && mediaUrl && inboundBody === "[áudio recebido]") {
          try {
            const { transcribeAudioUrl } = await import("@/lib/ai.server");
            const _ttStart = Date.now();
            const transcript = await transcribeAudioUrl(mediaUrl, integ.openai_api_key ?? undefined);
            if (transcript) inboundBody = transcript;
            try {
              const { logEvent } = await import("@/lib/agent-logger.server");
              await logEvent({ userId, phone, conversationId: conv?.id, type: "whisper_transcribe", level: "info", summary: `📝 Whisper transcreveu áudio (${transcript?.length ?? 0} chars)`, response: transcript ?? null, durationMs: Date.now() - _ttStart });
            } catch {}
          } catch (e) {
            console.error("transcribe failed", e);
            try {
              const { logEvent } = await import("@/lib/agent-logger.server");
              await logEvent({ userId, phone, conversationId: conv?.id, type: "whisper_transcribe", level: "error", summary: "Falha ao transcrever áudio (Whisper)", error: (e as Error)?.message ?? String(e) });
            } catch {}
          }
        }

        const now = new Date().toISOString();
        await supabaseAdmin.from("messages").insert({
          user_id: userId,
          conversation_id: conv.id,
          sender: outbound ? "agente" : "cliente",
          kind,
          body: inboundBody,
          audio_url: kind === "audio" ? mediaUrl : null,
          external_id: messageId,
        });
        await supabaseAdmin
          .from("conversations")
          .update({
            last_message_preview: inboundBody.slice(0, 120),
            last_message_at: now,
            status: outbound ? "aguardando" : "agente_respondendo",
          })
          .eq("id", conv.id);

        // Mensagem enviada pelo celular (fromMe): apenas espelha no painel
        // e encerra — não roda IA, funil, stop, teste grátis, etc.
        if (outbound) return new Response("ok (fromMe mirrored)");

        // Áudio recebido: já foi transcrito acima; o agente segue o fluxo
        // normal e, mais adiante, responderá por áudio (TTS) se houver
        // credenciais ElevenLabs configuradas.

        if (isStopRequest(inboundBody)) {
          await supabaseAdmin
            .from("contacts")
            .update({
              status: "bloqueado",
              temperatura: "bloqueado",
              temperatura_updated_at: now,
              last_interaction_at: now,
            })
            .eq("id", contact.id);
          await supabaseAdmin
            .from("conversations")
            .update({ status: "aguardando" })
            .eq("id", conv.id);
          return new Response("ok (stop → blocked)");
        }

        // ===== TESTE GRÁTIS: detecta link IG/YT na mensagem do cliente =====
        if (integ.free_trial_enabled && integ.smm_api_key) {
          const { detectSocialLink, normalizeSocialLink, smmAddOrder, smmOrderStatus } = await import("@/lib/smm.server");

          // ----- Reclamação de teste não entregue -----
          const complaintRe = /\b(n[aã]o\s+(chegou|recebi|veio|funcionou|entrou|caiu)|cad[eê]\s+(as?\s+)?views?|sem\s+views?|nada\s+chegou|n[aã]o\s+vi\s+nada|nao\s+apareceu|n[aã]o\s+apareceu|teste\s+n[aã]o)/i;
          if (complaintRe.test(inboundBody)) {
            const smmCreds = {
              url: integ.smm_panel_url ?? "https://mindsmmpanel.com/smmpanel/api/v1",
              key: integ.smm_api_key,
            };
            const { uazapiSendText } = await import("@/lib/uazapi.server");
            const creds = { uazapi_url: integ.uazapi_url ?? "", uazapi_token: integ.uazapi_token ?? "" };
            const { data: lastTrial } = await supabaseAdmin
              .from("free_trials")
              .select("id, order_id, link_enviado, link_normalized, servico, quantidade, status")
              .eq("user_id", userId)
              .eq("telefone", phone)
              .order("criado_em", { ascending: false })
              .limit(1)
              .maybeSingle();

            let replyText: string | null = null;

            if (lastTrial?.order_id) {
              try {
                const st = await smmOrderStatus(smmCreds, lastTrial.order_id);
                const status = (st.status ?? lastTrial.status ?? "").toLowerCase();
                console.log(`[free-trial:complaint] phone=${phone} order=${lastTrial.order_id} status=${status}`);
                if (status === "completed") {
                  replyText = "Aqui mostra que foi entregue! Às vezes demora alguns minutos pra atualizar no Instagram. Dá uma olhada agora no Reel";
                } else if (status === "pending" || status === "processing" || status === "in_progress") {
                  replyText = "Ainda está processando, já vai chegar! Normalmente leva alguns minutos";
                } else if (status === "canceled" || status === "cancelled" || status === "partial" || status === "failed") {
                  // Reenvia automaticamente o pedido com o mesmo link
                  try {
                    const res = await smmAddOrder(smmCreds, {
                      service: lastTrial.servico ?? integ.smm_service_id ?? "",
                      link: lastTrial.link_enviado!,
                      quantity: lastTrial.quantidade ?? 100,
                    });
                    if (res.order) {
                      await supabaseAdmin.from("free_trials").insert({
                        user_id: userId,
                        contact_id: contact.id,
                        conversation_id: conv.id,
                        telefone: phone,
                        link_enviado: lastTrial.link_enviado,
                        link_normalized: lastTrial.link_normalized,
                        order_id: String(res.order),
                        servico: lastTrial.servico,
                        quantidade: lastTrial.quantidade ?? 100,
                        status: "pending",
                        raw_response: res.raw as never,
                      });
                      replyText = "Tive um problema no envio anterior, já reenviei pra você!";
                    }
                  } catch (e) {
                    console.error("[free-trial:complaint] resend failed", e);
                  }
                }
              } catch (e) {
                console.error("[free-trial:complaint] status check failed", e);
              }
            }

            if (replyText) {
              try { await uazapiSendText(creds, phone, replyText); } catch (e) { console.error("uazapi send (complaint) failed", e); }
              const nowC = new Date().toISOString();
              await supabaseAdmin.from("messages").insert({
                user_id: userId, conversation_id: conv.id, sender: "agente", kind: "texto", body: replyText,
              });
              await supabaseAdmin.from("conversations").update({
                last_message_preview: replyText.slice(0, 120),
                last_message_at: nowC,
                status: "aguardando",
              }).eq("id", conv.id);
              return new Response("ok (free trial complaint)");
            }
            // Sem pedido encontrado ou status indefinido → deixa o agente normal responder
          }

          const link = detectSocialLink(inboundBody);
          // ----- Pedido de teste grátis SEM link: verifica ANTES se já usou -----
          if (!link) {
            const trialIntentRe = /\b(teste\s*gr[aá]tis|amostra\s*gr[aá]tis|quero\s+(o\s+)?teste|posso\s+(fazer|ter|ganhar)\s+(um\s+)?teste|me\s+d[aá]\s+(um\s+)?teste|tem\s+teste|libera\s+(o\s+)?teste|free\s*trial)\b/i;
            if (trialIntentRe.test(inboundBody)) {
              // Se o cliente está perguntando sobre teste para outra pessoa /
              // outro número, deixa o agente IA responder honestamente — não bloqueia.
              const friendRe = /\b(amig[oa]|colega|irm[aã]o|primo|parente|outr[oa]\s+(pessoa|n[uú]mero|whats|cel|celular|conta)|para\s+ele|para\s+ela|de\s+outro\s+n[uú]mero)\b/i;
              if (friendRe.test(inboundBody)) {
                // Deixa o fluxo seguir para a IA com contexto real.
              } else {
                // Detecta plataforma citada na mensagem
                const txt = inboundBody.toLowerCase();
                const platformMatch: { key: string; label: string } | null =
                  /\binstagram|insta\b/.test(txt) ? { key: "instagram", label: "Instagram" } :
                  /\btiktok|tik\s*tok\b/.test(txt) ? { key: "tiktok", label: "TikTok" } :
                  /\byoutube|yt\b/.test(txt) ? { key: "youtube", label: "YouTube" } :
                  /\bspotify\b/.test(txt) ? { key: "spotify", label: "Spotify" } :
                  /\bkwai\b/.test(txt) ? { key: "kwai", label: "Kwai" } :
                  /\bfacebook|\bfb\b/.test(txt) ? { key: "facebook", label: "Facebook" } :
                  /\btwitter|\bx\b/.test(txt) ? { key: "twitter", label: "Twitter/X" } :
                  null;

                if (platformMatch) {
                  // Busca serviços de teste ativos para essa plataforma
                  const { data: ftsRows } = await supabaseAdmin
                    .from("free_test_services")
                    .select("service_id, service_name, category, enabled")
                    .eq("user_id", userId)
                    .eq("enabled", true);
                  const platformServiceIds = (ftsRows ?? [])
                    .filter((r) => `${r.service_name} ${r.category}`.toLowerCase().includes(platformMatch.key))
                    .map((r) => String(r.service_id));

                  const { uazapiSendText } = await import("@/lib/uazapi.server");
                  const creds = { uazapi_url: integ.uazapi_url ?? "", uazapi_token: integ.uazapi_token ?? "" };

                  if (platformServiceIds.length === 0) {
                    // Não há teste para essa plataforma — não bloqueia, deixa IA responder
                    // (a IA tem o catálogo e oferece mínimo pago)
                  } else {
                    // Verifica se ESTE telefone já completou teste DESSA plataforma
                    const { data: completedThis } = await supabaseAdmin
                      .from("free_trials")
                      .select("id, servico")
                      .eq("user_id", userId)
                      .eq("telefone", phone)
                      .eq("status", "completed")
                      .in("servico", platformServiceIds)
                      .limit(1)
                      .maybeSingle();
                    if (completedThis) {
                      const replyText = `Você já recebeu seu teste grátis de ${platformMatch.label}! Posso te montar um pacote completo agora?`;
                      try { await uazapiSendText(creds, phone, replyText); } catch (e) { console.error("uazapi send (trial-used) failed", e); }
                      const nowT = new Date().toISOString();
                      await supabaseAdmin.from("messages").insert({
                        user_id: userId, conversation_id: conv.id, sender: "agente", kind: "texto", body: replyText,
                      });
                      await supabaseAdmin.from("conversations").update({
                        last_message_preview: replyText.slice(0, 120),
                        last_message_at: nowT,
                        status: "aguardando",
                      }).eq("id", conv.id);
                      return new Response("ok (trial already used for platform)");
                    }
                    // Não usou essa plataforma ainda → deixa IA seguir e pedir o link
                  }
                }
                // Sem plataforma específica citada → deixa IA conduzir
              }
            }
          }
          if (link) {
            // Trava de segurança: teste grátis sempre processa APENAS o telefone
            // que enviou o link no webhook atual. Nenhum loop / forEach sobre
            // outros contatos. Log explícito para auditoria.
            console.log(`[free-trial] Processando teste grátis para: ${phone} (contact_id=${contact.id})`);
            // Instagram views só funcionam em Reel/vídeo, nunca em foto (/p/)
            if (link.platform === "instagram") {
              const path = (() => { try { return new URL(link.url).pathname.toLowerCase(); } catch { return link.url.toLowerCase(); } })();
              const isVideo = /\/(reel|reels|tv)\//.test(path);
              const isPhoto = /\/p\//.test(path) && !isVideo;
              if (isPhoto) {
                const { uazapiSendText } = await import("@/lib/uazapi.server");
                const creds = { uazapi_url: integ.uazapi_url ?? "", uazapi_token: integ.uazapi_token ?? "" };
                const msg = "Esse link é de uma foto, views só funcionam em Reel ou vídeo. Me manda o link de um Reel do seu perfil!";
                try { await uazapiSendText(creds, phone, msg); } catch (e) { console.error("uazapi send (trial photo) failed", e); }
                await supabaseAdmin.from("messages").insert({
                  user_id: userId, conversation_id: conv.id, sender: "agente", kind: "texto", body: msg,
                });
                await supabaseAdmin.from("conversations").update({
                  last_message_preview: msg.slice(0, 120),
                  last_message_at: new Date().toISOString(),
                  status: "aguardando",
                }).eq("id", conv.id);
                return new Response("ok (trial blocked: instagram photo)");
              }
            }
            // Resolve service: prefer per-platform free_test_services, fall back to legacy smm_service_id
            const platformKeywords: Record<string, string[]> = {
              instagram: ["instagram", "insta"],
              youtube: ["youtube", "yt", "short"],
              tiktok: ["tiktok", "tik tok"],
              spotify: ["spotify"],
            };
            const kws = platformKeywords[link.platform] ?? [link.platform];
            const { data: ftsRows } = await supabaseAdmin
              .from("free_test_services")
              .select("service_id, service_name, category, quantity")
              .eq("user_id", userId)
              .eq("enabled", true);
            const matched = (ftsRows ?? []).find((r) => {
              const hay = `${r.category ?? ""} ${r.service_name ?? ""}`.toLowerCase();
              return kws.some((k) => hay.includes(k));
            });
            const serviceId = matched?.service_id ?? integ.smm_service_id ?? "";
            const qty = matched?.quantity ?? 100;
            if (!serviceId) {
              console.warn("[free-trial] no service configured for platform", link.platform);
              return new Response("ok (no trial service for platform)");
            }
            const linkNorm = normalizeSocialLink(link.url);
            const { data: trialByPhone } = await supabaseAdmin
              .from("free_trials")
              .select("id, status")
              .eq("user_id", userId)
              .eq("telefone", phone)
              .order("criado_em", { ascending: false })
              .maybeSingle();
            const { data: trialByLink } = await supabaseAdmin
              .from("free_trials")
              .select("id, telefone, status")
              .eq("user_id", userId)
              .eq("link_normalized", linkNorm)
              .order("criado_em", { ascending: false })
              .maybeSingle();
            // Só bloqueia reenvio se o teste anterior foi concluído com sucesso (Completed).
            // Pedidos canceled/partial/failed liberam novo envio.
            const phoneCompleted = trialByPhone?.status === "completed" ? trialByPhone : null;
            const linkCompleted = trialByLink?.status === "completed" ? trialByLink : null;
            const existingTrial = phoneCompleted || linkCompleted;

            const { uazapiSendText } = await import("@/lib/uazapi.server");
            const creds = {
              uazapi_url: integ.uazapi_url ?? "",
              uazapi_token: integ.uazapi_token ?? "",
            };

            let replyText: string;

            if (existingTrial) {
              replyText = linkCompleted && !phoneCompleted
                ? "Esse perfil já recebeu um teste anteriormente. Que tal aproveitar e fazer um pedido completo?"
                : "Você já usou seu teste grátis. Posso te montar um pacote completo a partir de R$5?";
            } else {
              const smmCreds = {
                url: integ.smm_panel_url ?? "https://mindsmmpanel.com/smmpanel/api/v1",
                key: integ.smm_api_key,
              };
              const tryOrder = async () => smmAddOrder(smmCreds, { service: serviceId, link: link.url, quantity: qty });
              let result: Awaited<ReturnType<typeof tryOrder>> | null = null;
              let lastErr: string | null = null;
              try {
                result = await tryOrder();
                console.log(
                  `[free-trial] Resposta API teste grátis (telefone=${phone}):`,
                  JSON.stringify(result.raw),
                );
                if (!result.order) lastErr = result.error ?? "sem order id";
              } catch (e) {
                lastErr = e instanceof Error ? e.message : String(e);
                console.error(`[free-trial] Erro API teste grátis (telefone=${phone}):`, lastErr);
              }
              try {
                if (lastErr || !result?.order) {
                  throw new Error(lastErr ?? "sem order id");
                }
                await supabaseAdmin.from("free_trials").insert({
                  user_id: userId,
                  contact_id: contact.id,
                  conversation_id: conv.id,
                  telefone: phone,
                  link_enviado: link.url,
                  link_normalized: linkNorm,
                  order_id: String(result.order),
                  servico: serviceId,
                  quantidade: qty,
                  status: "pending",
                  raw_response: result.raw as never,
                });
                try {
                  const { logEvent } = await import("@/lib/agent-logger.server");
                  await logEvent({ userId, phone, conversationId: conv.id, type: "free_trial", level: "info", summary: `🎵 Teste grátis processado: ${qty} para ${link.platform} (order ${result.order})`, metadata: { serviceId, qty, link: link.url, platform: link.platform, order: result.order } });
                } catch {}
                replyText =
                  `Recebi! Já liberei ${qty} ${matched?.category?.toLowerCase().includes("view") || matched?.category?.toLowerCase().includes("visual") ? "views" : "unidades"} grátis no seu link, costuma chegar em poucos minutos ✅`;
              } catch (e) {
                const raw = e instanceof Error ? e.message : String(e);
                console.error("[free-trial] smm add failed", { error: raw, serviceId, qty, url: link.url, platform: link.platform });
                try {
                  const { logEvent } = await import("@/lib/agent-logger.server");
                  await logEvent({ userId, phone, conversationId: conv.id, type: "free_trial", level: "error", summary: `Falha no teste grátis (${link.platform})`, error: raw, metadata: { serviceId, qty, link: link.url, platform: link.platform } });
                } catch {}
                const low = raw.toLowerCase();
                if (/private|privado|not.*public/.test(low)) {
                  replyText = "Seu perfil precisa estar público pra receber as views. Deixa público e me manda o link de novo!";
                } else if (/already|duplicate|exists/.test(low)) {
                  replyText = "Esse perfil já recebeu um teste anteriormente. Quer que eu monte um pacote completo a partir de R$5?";
                } else if (/invalid|not found|link|url/.test(low)) {
                  const tip = link.platform === "instagram"
                    ? "Me manda o link de um Reel ou vídeo do seu Instagram."
                    : link.platform === "youtube"
                      ? "Me manda o link do vídeo do YouTube."
                      : link.platform === "tiktok"
                        ? "Me manda o link do vídeo do TikTok."
                        : "Me manda o link da música do Spotify.";
                  replyText = `Esse link não funcionou aqui. ${tip}`;
                } else if (/min|minimum|quantidade/.test(low)) {
                  replyText = "A quantidade do teste não bate com o mínimo do serviço. Já tô ajustando aqui!";
                } else {
                  replyText = "Me manda o link de novo que processo agora!";
                }
              }
            }

            try {
              await uazapiSendText(creds, phone, replyText);
            } catch (e) {
              console.error("uazapi send (trial) failed", e);
            }
            const nowT = new Date().toISOString();
            await supabaseAdmin.from("messages").insert({
              user_id: userId,
              conversation_id: conv.id,
              sender: "agente",
              kind: "texto",
              body: replyText,
            });
            await supabaseAdmin
              .from("conversations")
              .update({
                last_message_preview: replyText.slice(0, 120),
                last_message_at: nowT,
                status: "aguardando",
              })
              .eq("id", conv.id);
            await supabaseAdmin
              .from("contacts")
              .update({ last_interaction_at: nowT, status: "em_conversa" })
              .eq("id", contact.id);
            return new Response("ok (free trial)");
          }
        }

        // "Modo Disparos": número usado para abordagem ativa — não responde inbound.
        if (disparosMode) return new Response("ok (disparos mode: no auto-reply)");

        // ===== Funis de boas-vindas (múltiplos por número; primeiro gatilho que casar dispara, uma vez por contato) =====
        if (numberId && !isDirectClientQuestion(inboundBody)) {
          try {
            const { data: funnels } = await supabaseAdmin
              .from("welcome_funnels")
              .select("id, name, enabled, delay_seconds, trigger_keywords, steps, sort_order")
              .eq("user_id", userId)
              .eq("whatsapp_number_id", numberId)
              .eq("enabled", true)
              .order("sort_order", { ascending: true });

            const haystack = normalizeText(inboundBody ?? "");

            type FunnelRow = {
              id: string;
              name: string;
              enabled: boolean;
              delay_seconds: number;
              trigger_keywords: string;
              steps: {
                welcome_text?: { enabled?: boolean; text?: string; delay_seconds?: number };
                audio?: { enabled?: boolean; url?: string; delay_seconds?: number };
                panel_text?: { enabled?: boolean; text?: string; delay_seconds?: number };
                video?: { enabled?: boolean; url?: string; caption?: string; delay_seconds?: number };
                services_text?: { enabled?: boolean; text?: string; delay_seconds?: number };
              } | null;
            };

            let matchedFunnel: FunnelRow | null = null;
            for (const row of (funnels ?? []) as FunnelRow[]) {
              const keywords = (row.trigger_keywords ?? "")
                .split(/[,;\n]/)
                .map((k) => normalizeText(k.trim()))
                .filter(Boolean);
              if (keywords.length === 0) continue;
              if (keywords.some((k) => haystack.includes(k))) {
                matchedFunnel = row;
                break;
              }
            }
            if (!matchedFunnel) throw new Error("__skip_funnel__");

            // Só dispara uma vez por contato (por funil)
            const { data: prevRun } = await supabaseAdmin
              .from("welcome_funnel_runs")
              .select("funnel_id")
              .eq("funnel_id", matchedFunnel.id)
              .eq("contact_id", contact.id)
              .maybeSingle();
            if (prevRun) throw new Error("__skip_funnel__");

            const f = matchedFunnel;
            const defaultDelaySec = f.delay_seconds ?? 3;
            const clampDelayMs = (sec: number | undefined) =>
              Math.max(0, Math.min((sec ?? defaultDelaySec) * 1000, 180_000));
            const creds = {
              uazapi_url: integ.uazapi_url ?? numberUazapiUrl ?? "",
              uazapi_token: integ.uazapi_token ?? instanceToken,
            };
            const { uazapiSendText, uazapiSendMedia } = await import("@/lib/uazapi.server");
            const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

            const steps: Array<{
              delayMs: number;
              run: () => Promise<{ kind: "texto" | "audio" | "video"; body: string; audio_url?: string | null }>;
            }> = [];
            const s = f.steps ?? {};
            if (s.welcome_text?.enabled && s.welcome_text.text) {
              const text = s.welcome_text.text;
              steps.push({
                delayMs: clampDelayMs(s.welcome_text.delay_seconds),
                run: async () => {
                  await uazapiSendText(creds, phone, text);
                  return { kind: "texto", body: text };
                },
              });
            }
            if (s.audio?.enabled && s.audio.url) {
              const url = s.audio.url;
              steps.push({
                delayMs: clampDelayMs(s.audio.delay_seconds),
                run: async () => {
                  await uazapiSendMedia(creds, phone, "audio", url);
                  return { kind: "audio", body: "[áudio]", audio_url: url };
                },
              });
            }
            if (s.panel_text?.enabled && s.panel_text.text) {
              const text = s.panel_text.text;
              steps.push({
                delayMs: clampDelayMs(s.panel_text.delay_seconds),
                run: async () => {
                  await uazapiSendText(creds, phone, text);
                  return { kind: "texto", body: text };
                },
              });
            }
            if (s.video?.enabled && s.video.url) {
              const url = s.video.url;
              const caption = s.video.caption?.trim() || undefined;
              steps.push({
                delayMs: clampDelayMs(s.video.delay_seconds),
                run: async () => {
                  await uazapiSendMedia(creds, phone, "video", url, caption);
                  return { kind: "texto", body: caption ? `[vídeo] ${caption}` : "[vídeo]" };
                },
              });
            }
            if (s.services_text?.enabled && s.services_text.text) {
              const text = s.services_text.text;
              steps.push({
                delayMs: clampDelayMs(s.services_text.delay_seconds),
                run: async () => {
                  await uazapiSendText(creds, phone, text);
                  return { kind: "texto", body: text };
                },
              });
            }

            let lastBody = "";
            for (let i = 0; i < steps.length; i++) {
              if (steps[i].delayMs > 0) await sleep(steps[i].delayMs);
              const r = await steps[i].run();
              lastBody = r.body;
              await supabaseAdmin.from("messages").insert({
                user_id: userId,
                conversation_id: conv.id,
                sender: "agente",
                kind: r.kind === "video" ? "texto" : r.kind,
                body: r.body,
                audio_url: r.audio_url ?? null,
              });
            }
            if (steps.length > 0) {
              const stamp = new Date().toISOString();
              await supabaseAdmin.from("welcome_funnel_runs").insert({
                funnel_id: f.id,
                contact_id: contact.id,
                user_id: userId,
              });
              await supabaseAdmin
                .from("conversations")
                .update({
                  last_message_preview: lastBody.slice(0, 120),
                  last_message_at: stamp,
                  status: "aguardando",
                })
                .eq("id", conv.id);
              await supabaseAdmin
                .from("contacts")
                .update({ last_interaction_at: stamp, status: "em_conversa" })
                .eq("id", contact.id);
              return new Response("ok (welcome funnel)");
            }
          } catch (e) {
            if ((e as Error)?.message !== "__skip_funnel__") {
              console.error("welcome funnel failed", e);
            }
          }
        }

        const { data: agent } = await supabaseAdmin
          .from("agent_config")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle();
        if (!agent) return new Response("ok (no agent config)");

        // Global + per-conversation kill switch
        const globalEnabled = (agent as { agent_enabled?: boolean }).agent_enabled !== false;
        const convEnabled = conv.agent_enabled !== false;
        if (!globalEnabled || !convEnabled) {
          return new Response("ok (agent disabled)");
        }

        // Já marcada para revisão manual: não responde até reativação manual.
        if ((conv as { needs_review?: boolean }).needs_review) {
          return new Response("ok (needs review)");
        }

        // ===== Detecção de conversa improdutiva =====
        try {
          const { data: recentClient } = await supabaseAdmin
            .from("messages")
            .select("body, kind")
            .eq("conversation_id", conv.id)
            .eq("sender", "cliente")
            .order("created_at", { ascending: false })
            .limit(6);
          const prior = ((recentClient ?? []) as Array<{ body: string; kind: string }>).reverse();
          // A mensagem atual já foi inserida acima, então removemos a última
          // ocorrência idêntica do histórico para evitar contagem dupla.
          const priorWithoutCurrent =
            prior.length > 0 &&
            prior[prior.length - 1].kind === kind &&
            (prior[prior.length - 1].body ?? "") === (inboundBody ?? "")
              ? prior.slice(0, -1)
              : prior;
          const detected = detectUnproductive(priorWithoutCurrent, inboundBody, kind);
          if (detected) {
            const stamp = new Date().toISOString();
            await supabaseAdmin
              .from("conversations")
              .update({
                needs_review: true,
                review_reason: detected.reason,
                auto_paused_at: stamp,
                internal_note: `Agente pausado automaticamente — ${detected.reason} em ${new Date(stamp).toLocaleString("pt-BR")}`,
                status: "aguardando",
              })
              .eq("id", conv.id);
            await supabaseAdmin
              .from("contacts")
              .update({
                temperatura: "bloqueado",
                temperatura_updated_at: stamp,
              })
              .eq("id", contact.id);
            console.log(`[unproductive] conv=${conv.id} reason="${detected.reason}"`);
            return new Response("ok (auto-paused: unproductive)");
          }
        } catch (e) {
          console.error("[unproductive] detection failed", e);
        }

        const { data: history } = await supabaseAdmin
          .from("messages")
          .select("sender, body")
          .eq("conversation_id", conv.id)
          .order("created_at", { ascending: true });

        console.info("[agent-webhook] Loaded full conversation history for Claude", {
          conversationId: conv.id,
          messagesCount: history?.length ?? 0,
        });

        const { generateAgentReply } = await import("@/lib/ai.server");

        // Check if a welcome funnel has already been delivered for this contact.
        const { data: priorFunnelRun } = await supabaseAdmin
          .from("welcome_funnel_runs")
          .select("id")
          .eq("contact_id", contact.id)
          .limit(1)
          .maybeSingle();
        const funnelAlreadySent = !!priorFunnelRun;

        // Load knowledge base examples (text + extracted from images) for this user.
        const { data: kbRows } = await supabaseAdmin
          .from("knowledge_base")
          .select("context, content")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(50);
        const knowledgeExamples = (kbRows ?? [])
          .filter((r) => (r.content ?? "").trim().length > 0)
          .map((r) => ({ context: r.context, content: r.content as string }));

        // Load Panel Guide screens (Mind SMM) so the agent can step the customer through.
        const { data: pgRows } = await supabaseAdmin
          .from("panel_guide")
          .select("name, description, extracted_content")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(30);
        const panelScreens = (pgRows ?? []).map((r) => ({
          name: r.name as string,
          description: r.description as string | null,
          extracted_content: r.extracted_content as string | null,
        }));

        // Load forbidden rules so the agent always deflects without breaking them.
        const { data: frRows } = await supabaseAdmin
          .from("forbidden_rules")
          .select("rule, deflection, enabled")
          .eq("user_id", userId)
          .order("position", { ascending: true });
        const forbiddenRules = (frRows ?? [])
          .filter((r) => r.enabled !== false)
          .map((r) => ({ rule: r.rule as string, deflection: (r.deflection as string | null) ?? null }));

        // Free-test services available for proactive offer when the agent detects hesitation.
        let freeTestServices: Array<{ service_id: string; service_name: string; category: string; quantity: number }> = [];
        if (integ.free_trial_enabled) {
          const { data: ftsRows } = await supabaseAdmin
            .from("free_test_services")
            .select("service_id, service_name, category, quantity")
            .eq("user_id", userId)
            .eq("enabled", true)
            .limit(50);
          freeTestServices = (ftsRows ?? []) as typeof freeTestServices;
        }

        // Real-time SMM catalogue: if enabled and the inbound message mentions
        // price / service keywords, fetch services from the panel and pass
        // them as context to the LLM.
        let servicesContext: string | null = null;
        let servicesFetchFailed = false;
        const a0 = agent as { services_realtime?: boolean };
        if (a0.services_realtime && integ.smm_api_key) {
          try {
            const { smmFetchServices } = await import("@/lib/smm.server");
            const services = await smmFetchServices({
              url: integ.smm_panel_url ?? "https://mindsmmpanel.com/smmpanel/api/v1",
              key: integ.smm_api_key,
            });
            console.log(
              "Serviços carregados:",
              services.length,
              "Primeiro:",
              services[0] ? JSON.stringify(services[0]) : "nenhum",
            );
            try {
              const { logEvent } = await import("@/lib/agent-logger.server");
              await logEvent({ userId, phone, conversationId: conv.id, type: "smm_services", level: services.length > 0 ? "info" : "warn", summary: `💰 Serviços carregados: ${services.length}`, metadata: { count: services.length } });
            } catch {}
            if (services.length > 0) {
              // Log dos serviços Spotify cru, para auditar mínimos/máximos.
              const spotifyRaw = services.filter((s) =>
                /spotify/i.test(`${s.name} ${s.category}`),
              );
              console.log("[catalogo] Spotify items:", JSON.stringify(spotifyRaw, null, 2));

              const fmt = (s: typeof services[number]) =>
                `ID: ${s.service} | Nome: ${s.name} | Categoria: ${s.category} | Preço por 1000: R$${s.rate} | MÍNIMO: ${s.min} | MÁXIMO: ${s.max}`;

              const baseList = services
                .slice(0, 200)
                .map(fmt)
                .join("\n");

              // Bloco destacado por plataforma — força o Claude a ler MÍNIMO/MÁXIMO reais
              // antes de inventar quantidade.
              const highlightBlocks: string[] = [];
              const pushBlock = (label: string, regex: RegExp) => {
                const items = services.filter((s) => regex.test(`${s.name} ${s.category}`));
                if (items.length === 0) return;
                const lines = items
                  .slice(0, 20)
                  .map(
                    (s) =>
                      `- ${s.name} | R$${s.rate} por 1000 | MÍNIMO: ${s.min} | MÁXIMO: ${s.max}`,
                  )
                  .join("\n");
                highlightBlocks.push(`SERVIÇOS ${label} (use estes dados, não invente):\n${lines}`);
              };
              pushBlock("SPOTIFY", /spotify/i);
              pushBlock("INSTAGRAM", /instagram/i);
              pushBlock("YOUTUBE", /youtube/i);
              pushBlock("TIKTOK", /tiktok/i);

              servicesContext = [
                baseList,
                ...highlightBlocks,
                "REGRA: SEMPRE consulte o campo MÍNIMO do catálogo acima antes de responder qualquer quantidade. NUNCA arredonde o mínimo. Se o catálogo diz MÍNIMO: 500, o mínimo é 500 — não 1000.",
              ].join("\n\n");
            } else {
              servicesFetchFailed = true;
            }
          } catch (e) {
            console.error("smm services fetch failed", e);
            servicesFetchFailed = true;
            try {
              const { logEvent } = await import("@/lib/agent-logger.server");
              await logEvent({ userId, phone, conversationId: conv.id, type: "smm_services", level: "error", summary: "Falha ao buscar serviços SMM", error: (e as Error)?.message ?? String(e) });
            } catch {}
          }
        } else {
          console.warn(
            "[smm] catálogo NÃO carregado — services_realtime:",
            !!a0.services_realtime,
            "| smm_api_key presente:",
            !!integ.smm_api_key,
          );
        }

        let reply: string;
        try {
          // Log resumo do prompt montado (sempre do banco, sem cache)
          const _mods = (agent as { modules?: Record<string, string> }).modules ?? {};
          const _modsEnabled = (agent as { modules_enabled?: Record<string, boolean> }).modules_enabled ?? {};
          const activeModulesCount = Object.entries(_mods).filter(
            ([k, v]) => v && String(v).trim() && _modsEnabled[k] !== false,
          ).length;
          const loadedServicesCount = servicesContext
            ? (servicesContext.match(/\nID: /g)?.length ?? 0)
            : 0;
          console.log(
            `Prompt montado: ${activeModulesCount} módulos ativos | ${loadedServicesCount} serviços carregados | ${knowledgeExamples.length} exemplos na base`,
          );

          const aiHistory = ((history ?? []) as Array<{ sender: "agente" | "cliente"; body: string }>).filter(
            (m) =>
              !/não consigo ouvir áudio por aqui/i.test(m.body ?? "") &&
              !/não consigo mandar áudio/i.test(m.body ?? "") &&
              !/respondendo (?:certinho )?por texto/i.test(m.body ?? ""),
          );
          if (servicesFetchFailed) {
            reply = "Deixa eu verificar os valores e te retorno em instantes!";
          } else if (kind === "audio" && inboundBody === "[áudio recebido]") {
            reply = "Não consegui entender bem esse áudio. Pode mandar de novo?";
          } else {
          // Consulta status real de pedido quando o cliente mandar um ID
          // numérico depois do agente ter pedido o "ID do pedido", OU quando
          // a mensagem atual reclama de problema com pedido + traz um número.
          let orderStatusContext: string | null = null;
          try {
            const lastAgentMsg = [...(aiHistory ?? [])].reverse().find((m) => m.sender === "agente");
            const agentAskedForId =
              !!lastAgentMsg && /id\s+do\s+pedido/i.test(lastAgentMsg.body ?? "");
            const complainRe = /(n[aã]o\s+funciono|n[aã]o\s+recebi|deu\s+problema|n[aã]o\s+chegou|n[aã]o\s+caiu|n[aã]o\s+veio|atrasad)/i;
            const numMatch = (text ?? "").match(/\b(\d{4,})\b/);
            const shouldLookup =
              !!numMatch && (agentAskedForId || complainRe.test(text ?? ""));
            if (shouldLookup && integ.smm_api_key && numMatch) {
              const { smmOrderStatus } = await import("@/lib/smm.server");
              const orderId = numMatch[1];
              const st = await smmOrderStatus(
                {
                  url: integ.smm_panel_url ?? "https://mindsmmpanel.com/smmpanel/api/v1",
                  key: integ.smm_api_key,
                },
                orderId,
              );
              if (st.error || !st.status) {
                orderStatusContext = `STATUS DE PEDIDO (consulta falhou para ID ${orderId}): redirecione o cliente assim — "Abre um ticket no menu Suporte do painel informando o ID do pedido que a equipe resolve!". NUNCA invente status.`;
              } else {
                orderStatusContext = `STATUS REAL DO PEDIDO ${orderId} (consultado agora na API do painel): status="${st.status}"${st.start_count !== undefined ? `, start_count=${st.start_count}` : ""}${st.quantity !== undefined ? `, quantity=${st.quantity}` : ""}. Responda ao cliente com base nesse status real, de forma curta e humana. NUNCA invente. Se "completed"/"partial"/"in progress" → explique em 1 frase. Se "canceled"/"refunded" → oriente abrir ticket no Suporte do painel.`;
              }
        } else if ((agentAskedForId || complainRe.test(text ?? "")) && !integ.smm_api_key) {
              orderStatusContext = `SEM CHAVE SMM PARA CONSULTAR STATUS DE PEDIDO. Se o cliente já mandou ID, redirecione: "Abre um ticket no menu Suporte do painel informando o ID do pedido que a equipe resolve!".`;
            }
          } catch (e) {
            console.error("[order-status] lookup failed", e);
            orderStatusContext = `STATUS DE PEDIDO indisponível agora. Redirecione: "Abre um ticket no menu Suporte do painel informando o ID do pedido que a equipe resolve!".`;
          }

          console.log('Chamando Claude...');
          const _claudeArgs = {
            anthropicApiKey: integ.anthropic_api_key,
            agent,
            contact: { nome: contact.nome, perfil: contact.perfil },
            history: aiHistory,
            servicesContext,
            isInbound: true,
            funnelAlreadySent,
            knowledgeExamples,
            panelScreens,
            forbiddenRules,
            freeTestServices,
            extraContext: orderStatusContext,
            inputKind: kind,
          };
          try {
            const _modulesCount = Array.isArray((agent as { modules_enabled?: unknown[] }).modules_enabled) ? ((agent as { modules_enabled: unknown[] }).modules_enabled).length : 0;
            console.log('Prompt context:', { modules: _modulesCount, services: freeTestServices?.length ?? 0, examples: knowledgeExamples?.length ?? 0, historyLen: aiHistory?.length ?? 0, extraContext: orderStatusContext?.slice(0, 200) ?? '' });
          } catch {}
          const _claudeStart = Date.now();
          reply = await generateAgentReply(_claudeArgs);
          const _claudeMs = Date.now() - _claudeStart;
          console.log('Resposta do Claude:', reply);
          console.log('=== FIM DO PROCESSAMENTO ===');
          try {
            const { logEvent } = await import("@/lib/agent-logger.server");
            await logEvent({
              userId, phone, conversationId: conv?.id,
              type: "claude_reply", level: "info",
              summary: `🤖 Claude respondeu (${_claudeMs}ms): ${(reply ?? "").slice(0, 80)}`,
              prompt: JSON.stringify({
                contact: _claudeArgs.contact,
              freeTestServicesCount: freeTestServices?.length ?? 0,
              catalogServicesCount: servicesContext
                ? (servicesContext.match(/\nID: /g)?.length ?? 0)
                : 0,
              servicesRealtimeEnabled: !!a0.services_realtime,
              hasSmmApiKey: !!integ.smm_api_key,
                examples: knowledgeExamples?.length ?? 0,
                history: aiHistory?.slice(-6) ?? [],
                extraContext: orderStatusContext ?? null,
                agentIdentity: (agent as { agent_name?: string }).agent_name ?? null,
                hasBaseInstruction: !!(agent as { base_instruction?: string }).base_instruction,
                modulesEnabledCount: Object.values(
                  ((agent as { modules_enabled?: Record<string, boolean> }).modules_enabled ?? {}),
                ).filter(Boolean).length,
              }, null, 2),
              response: reply ?? null,
              durationMs: _claudeMs,
            });
          } catch {}
          }
          if (!reply || !reply.trim()) reply = FALLBACK_REPLY;
        } catch (e) {
          console.error("claude failed", e);
          reply = FALLBACK_REPLY;
          try {
            const { logEvent } = await import("@/lib/agent-logger.server");
            await logEvent({ userId, phone, conversationId: conv?.id, type: "claude_reply", level: "error", summary: "Falha ao chamar Claude", error: (e as Error)?.message ?? String(e) });
          } catch {}
        }

        // Divide a resposta em partes quando o agente usa "===SPLIT===" (link separado).
        const replyParts = reply
          .split(/===SPLIT===/i)
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

        // Conteúdo "duro" que NÃO deve virar áudio (link explícito, preço, lista).
        // Mantemos a checagem por PARTE — o agente costuma colocar o link sozinho
        // depois de "===SPLIT===", então a parte falada continua áudio.
        const hasHardContent = (txt: string): boolean => {
          if (/https?:\/\//i.test(txt)) return true;
          if (/\b[\w-]+\.(com|com\.br|net|io|app|co)\b/i.test(txt)) return true;
          if (/R\$\s?\d|\d+[.,]\d{2}/.test(txt)) return true;
          if (/(^|\n)\s*(?:[-*•]|\d+[\.\)])\s+/m.test(txt)) return true;
          return false;
        };

        // Quando o cliente manda áudio, respondemos por áudio sempre que houver
        // ElevenLabs configurado e a PRIMEIRA parte da resposta for falável.
        // As demais partes (geralmente o link após "===SPLIT===") seguem como texto.
        const isAudioMessage = kind === "audio";
        const respondWithAudio =
          isAudioMessage &&
          !!integ.elevenlabs_api_key &&
          !!integ.elevenlabs_voice_id &&
          replyParts.length > 0;
        console.log(`🎤 Mensagem original era áudio: ${isAudioMessage} → usando ElevenLabs: ${respondWithAudio}`);
        console.log("🎙️ Audio decision:", {
          inputKind: kind,
          clienteSendouAudio: isAudioMessage,
          hasElevenLabsKey: !!integ.elevenlabs_api_key,
          hasVoiceId: !!integ.elevenlabs_voice_id,
          replyPartsCount: replyParts.length,
          firstPartPreview: replyParts[0]?.slice(0, 60),
          respondWithAudio,
        });
        if (kind === "audio" && !respondWithAudio) {
          try {
            const { logEvent } = await import("@/lib/agent-logger.server");
            if (!integ.elevenlabs_api_key) {
              await logEvent({
                userId,
                phone,
                conversationId: conv.id,
                type: "elevenlabs_tts",
                level: "error",
                summary: "API Key do ElevenLabs não configurada — fallback para texto",
              });
            }
            if (!integ.elevenlabs_voice_id) {
              await logEvent({
                userId,
                phone,
                conversationId: conv.id,
                type: "elevenlabs_tts",
                level: "error",
                summary: "Voice ID do ElevenLabs não configurado — fallback para texto",
              });
            }
            if (integ.elevenlabs_api_key && integ.elevenlabs_voice_id && replyParts.length === 0) {
              await logEvent({
                userId,
                phone,
                conversationId: conv.id,
                type: "elevenlabs_tts",
                level: "warn",
                summary: "ElevenLabs OK mas resposta vazia (replyParts=0) — fallback para texto",
              });
            }
          } catch {}
        } else if (kind === "audio" && respondWithAudio) {
          try {
            const { logEvent } = await import("@/lib/agent-logger.server");
            await logEvent({
              userId,
              phone,
              conversationId: conv.id,
              type: "elevenlabs_tts",
              level: "info",
              summary: `Chamando ElevenLabs com voice_id: ${integ.elevenlabs_voice_id}`,
            });
          } catch {}
        }
        // hasHardContent mantido apenas para referência — quando o cliente
        // mandou áudio, a resposta principal SEMPRE vai por áudio. Dados
        // específicos (preço/link) devem vir do Claude após ===SPLIT===.
        void hasHardContent;

        const { uazapiSendText, uazapiSendAudio, uazapiSendTyping, uazapiSendRecording, uazapiClearPresence } = await import("@/lib/uazapi.server");
        const sendCreds = { uazapi_url: integ.uazapi_url ?? "", uazapi_token: integ.uazapi_token ?? "" };
        const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

        // Human-like behavior: random delay between min and max, optional typing indicator.
        const a = agent as {
          response_delay_min_sec?: number;
          response_delay_max_sec?: number;
          typing_indicator_enabled?: boolean;
        };
        // Para respostas de áudio, encurtamos o delay para evitar estourar o
        // tempo de execução do Worker antes do TTS rodar (ElevenLabs + envio
        // já levam vários segundos por si só). A presença "gravando" continua
        // sendo enviada durante a geração do áudio.
        // Cap absoluto: agora processamos o webhook de forma síncrona (não
        // dá pra usar waitUntil neste runtime), então o delay precisa caber
        // bem dentro do timeout do Uazapi (~60s) considerando ainda IA + TTS.
        const HARD_CAP_SEC = respondWithAudio ? 5 : 25;
        const baseMin = Math.max(0, Math.min(a.response_delay_min_sec ?? 8, HARD_CAP_SEC));
        const baseMax = Math.max(baseMin, Math.min(a.response_delay_max_sec ?? 20, HARD_CAP_SEC));
        const minSec = baseMin;
        const maxSec = baseMax;
        const delaySegundos = Math.floor(Math.random() * (maxSec - minSec + 1)) + minSec;
        console.log('Delay sorteado:', delaySegundos, 'segundos');
        const delayMs = delaySegundos * 1000;
        const typingOn = a.typing_indicator_enabled !== false;
        if (delayMs > 0) {
          // Renova o status de presença a cada ~10s (Uazapi expira rápido)
          // para que "digitando"/"gravando" fique visível durante todo o delay.
          if (typingOn) {
            const sendPresence = () =>
              (respondWithAudio
                ? uazapiSendRecording(sendCreds, phone, 12000)
                : uazapiSendTyping(sendCreds, phone, 12000)
              ).catch((e) => {
                console.error(respondWithAudio ? "uazapi recording failed" : "uazapi typing failed", e);
              });
            const interval = setInterval(sendPresence, 10000);
            await sendPresence();
            try {
              await sleep(delayMs);
            } finally {
              clearInterval(interval);
            }
          } else {
            await sleep(delayMs);
          }
        }

        let replyKind: "texto" | "audio" = "texto";
        let audioDataUri: string | null = null;
        const skippedIdx = new Set<number>();
        try {
          if (respondWithAudio) {
            const { ttsElevenLabsBase64 } = await import("@/lib/ai.server");
            if (memWasRecentlySent(phone, replyParts[0]) || await wasRecentlySent(conv.id, replyParts[0])) {
              skippedIdx.add(0);
              replyKind = "audio";
            } else {
            memMarkSent(phone, replyParts[0]);
            // Mantém o "gravando áudio" durante a geração do TTS e durante o envio.
            const _ttsStart = Date.now();
            // Extrai links do texto para enviar separadamente como mensagem de texto.
            // Regex agressiva: pega http(s)://, www., e qualquer dominio.tld (com subdomínios e path).
            const urlRegex = /(https?:\/\/\S+|www\.\S+|\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?)/gi;
            const extractedUrls = Array.from(
              new Set(
                (replyParts[0].match(urlRegex) ?? [])
                  .map((u) => u.replace(/[.,;:!?)]+$/, ""))
                  .filter((u) => u.length > 3),
              ),
            );
            // Sanitiza o texto para o TTS: troca R$ por palavras e remove TODOS os links.
            const ttsText = replyParts[0]
              // Valores em R$
              .replace(/R\$\s?(\d+),(\d+)/g, (_m, r, c) => `${r} reais e ${c} centavos`)
              .replace(/R\$\s?(\d+)/g, (_m, n) => `${n} reais`)
              // Horas (ex.: 1000h → 1000 horas)
              .replace(/(\d+)\s?h\b/gi, (_m, n) => `${n} horas`)
              // Milhares por extenso
              .replace(/\b1000\b/g, "mil")
              .replace(/\b2000\b/g, "dois mil")
              .replace(/\b3000\b/g, "três mil")
              .replace(/\b4000\b/g, "quatro mil")
              .replace(/\b5000\b/g, "cinco mil")
              .replace(/\b10000\b/g, "dez mil")
              .replace(/\b50000\b/g, "cinquenta mil")
              .replace(/\b100000\b/g, "cem mil")
              .replace(/\b500000\b/g, "quinhentos mil")
              // Siglas e abreviações comuns do nicho
              .replace(/\bHQ\b/g, "alta qualidade")
              .replace(/\bMQ\b/g, "média qualidade")
              .replace(/\bBQ\b/g, "baixa qualidade")
              .replace(/\bSR\b/g, "sem reposição")
              .replace(/===SPLIT===/g, "")
              // Links — remove tudo
              .replace(/https?:\/\/\S+/gi, "")
              .replace(/www\.\S+/gi, "")
              .replace(/\S+\.com\S*/gi, "")
              .replace(/\S+\.global\S*/gi, "")
              .replace(urlRegex, "")
              .replace(/\s+([.,!?])/g, "$1")
              .replace(/\s{2,}/g, " ")
              .trim();
            console.log("🔊 Gerando áudio via ElevenLabs...", { textLen: ttsText.length, voiceId: integ.elevenlabs_voice_id, urls: extractedUrls.length });
            let generatedAudio: string;
            try {
              [generatedAudio] = await Promise.all([
                ttsElevenLabsBase64({
                  apiKey: integ.elevenlabs_api_key!,
                  voiceId: integ.elevenlabs_voice_id!,
                  text: ttsText || replyParts[0],
                }),
                uazapiSendRecording(sendCreds, phone, 15000).catch((e) => {
                  console.error("uazapi recording failed", e);
                }),
              ]) as [string, unknown];
              console.log("✅ Áudio gerado com sucesso", { ms: Date.now() - _ttsStart, bytes: generatedAudio.length });
            } catch (ttsErr) {
              console.error("❌ Erro ElevenLabs:", ttsErr);
              try {
                const { logEvent } = await import("@/lib/agent-logger.server");
                await logEvent({ userId, phone, conversationId: conv.id, type: "elevenlabs_tts", level: "error", summary: `❌ Erro ElevenLabs: ${(ttsErr as Error)?.message ?? String(ttsErr)}`, error: (ttsErr as Error)?.message ?? String(ttsErr) });
              } catch {}
              throw ttsErr;
            }
            audioDataUri = generatedAudio;
            try {
              const { logEvent } = await import("@/lib/agent-logger.server");
              await logEvent({ userId, phone, conversationId: conv.id, type: "elevenlabs_tts", level: "info", summary: `🔊 ElevenLabs gerou áudio (${Date.now() - _ttsStart}ms)`, response: replyParts[0], durationMs: Date.now() - _ttsStart });
            } catch {}
            await Promise.all([
              uazapiSendAudio(sendCreds, phone, audioDataUri),
              uazapiSendRecording(sendCreds, phone, 8000).catch((e) => {
                console.error("uazapi recording failed", e);
              }),
            ]);
            replyKind = "audio";
            // Envia links extraídos como mensagens de texto separadas após o áudio.
            for (const url of extractedUrls) {
              if (memWasRecentlySent(phone, url) || await wasRecentlySent(conv.id, url)) continue;
              memMarkSent(phone, url);
              await uazapiSendTyping(sendCreds, phone, 1000).catch(() => {});
              await sleep(1000);
              await uazapiSendText(sendCreds, phone, url);
            }
            }
            // Envia partes adicionais (ex.: link após ===SPLIT===) como texto.
            for (let i = 1; i < replyParts.length; i += 1) {
              if (memWasRecentlySent(phone, replyParts[i]) || await wasRecentlySent(conv.id, replyParts[i])) {
                skippedIdx.add(i);
                continue;
              }
              memMarkSent(phone, replyParts[i]);
              await uazapiSendTyping(sendCreds, phone, 1200).catch(() => {});
              await sleep(1200);
              await uazapiSendText(sendCreds, phone, replyParts[i]);
            }
          } else {
            for (let i = 0; i < replyParts.length; i += 1) {
              if (memWasRecentlySent(phone, replyParts[i]) || await wasRecentlySent(conv.id, replyParts[i])) {
                skippedIdx.add(i);
                continue;
              }
              memMarkSent(phone, replyParts[i]);
              await uazapiSendText(
                sendCreds,
                phone,
                replyParts[i],
              );
              if (i < replyParts.length - 1) {
                await uazapiSendTyping(sendCreds, phone, 1200).catch(() => {});
                await sleep(1200);
              }
            }
          }
          await uazapiClearPresence(sendCreds, phone).catch(() => {});
        } catch (e) {
          await uazapiClearPresence(sendCreds, phone).catch(() => {});
          try {
            const { logEvent } = await import("@/lib/agent-logger.server");
            await logEvent({ userId, phone, conversationId: conv.id, type: "send_failed", level: "error", summary: "Falha ao enviar mensagem via Uazapi", error: (e as Error)?.message ?? String(e) });
          } catch {}
          return new Response(`uazapi send failed: ${(e as Error).message}`, { status: 502 });
        }

        const nowReply = new Date().toISOString();
        if (replyKind === "audio") {
          const rows: Array<{
            user_id: string;
            conversation_id: string;
            sender: "agente";
            kind: "audio" | "texto";
            body: string;
            audio_url: string | null;
          }> = [
          ];
          if (!skippedIdx.has(0)) {
            rows.push({
              user_id: userId,
              conversation_id: conv.id,
              sender: "agente",
              kind: "audio",
              body: replyParts[0],
              audio_url: audioDataUri,
            });
          }
          for (let i = 1; i < replyParts.length; i += 1) {
            if (skippedIdx.has(i)) continue;
            rows.push({
              user_id: userId,
              conversation_id: conv.id,
              sender: "agente",
              kind: "texto",
              body: replyParts[i],
              audio_url: null,
            });
          }
          if (rows.length > 0) await supabaseAdmin.from("messages").insert(rows);
        } else {
          const rows = replyParts
            .map((part, i) => ({ part, i }))
            .filter(({ i }) => !skippedIdx.has(i))
            .map(({ part }) => ({
              user_id: userId,
              conversation_id: conv.id,
              sender: "agente" as const,
              kind: "texto" as const,
              body: part,
              audio_url: null,
            }));
          if (rows.length > 0) await supabaseAdmin.from("messages").insert(rows);
        }
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

        // ===== Lead scoring automático (Quente/Morno/Frio/Bloqueado) =====
        try {
          const { classifyLeadTemperature } = await import("@/lib/ai.server");
          const fullHistory = [
            ...((history ?? []) as Array<{ sender: "agente" | "cliente"; body: string }>),
            { sender: "cliente" as const, body: inboundBody },
            { sender: "agente" as const, body: reply },
          ];
          const temperatura = await classifyLeadTemperature({ history: fullHistory });
          if (temperatura) {
            const stamp = new Date().toISOString();
            if (temperatura === "bloqueado") {
              await supabaseAdmin
                .from("contacts")
                .update({ temperatura, temperatura_updated_at: stamp, status: "bloqueado" })
                .eq("id", contact.id);
            } else if (temperatura === "cliente") {
              await supabaseAdmin
                .from("contacts")
                .update({ temperatura, temperatura_updated_at: stamp, status: "convertido", perfil: "ativo" })
                .eq("id", contact.id);
              await supabaseAdmin
                .from("conversations")
                .update({ status: "convertido" })
                .eq("id", conv.id);
            } else {
              await supabaseAdmin
                .from("contacts")
                .update({ temperatura, temperatura_updated_at: stamp })
                .eq("id", contact.id);
            }
          }
        } catch (e) {
          console.error("lead scoring failed", e);
        }

        return new Response("ok");
}
