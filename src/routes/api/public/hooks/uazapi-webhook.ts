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
        let mediaUrl = extractMediaUrl(payload);
        const messageId = extractMessageId(payload);
        if (!text && kind !== "audio") return new Response("empty");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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
            const transcript = await transcribeAudioUrl(mediaUrl, integ.openai_api_key ?? undefined);
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
        if (integ.free_trial_enabled && integ.smm_api_key && integ.smm_service_id) {
          const { detectSocialLink, smmAddOrder } = await import("@/lib/smm.server");
          const link = detectSocialLink(inboundBody);
          if (link) {
            const { data: existingTrial } = await supabaseAdmin
              .from("free_trials")
              .select("id, status, order_id")
              .eq("user_id", userId)
              .eq("telefone", phone)
              .maybeSingle();

            const { uazapiSendText } = await import("@/lib/uazapi.server");
            const creds = {
              uazapi_url: integ.uazapi_url ?? "",
              uazapi_token: integ.uazapi_token ?? "",
            };

            let replyText: string;

            if (existingTrial) {
              replyText =
                "Você já usou seu teste grátis! Mas tenho pacotes a partir de R$5 😊";
            } else {
              try {
                const result = await smmAddOrder(
                  {
                    url: integ.smm_panel_url ?? "https://mindsmmpanel.com/smmpanel/api/v1",
                    key: integ.smm_api_key,
                  },
                  { service: integ.smm_service_id, link: link.url, quantity: 100 },
                );
                if (!result.order) {
                  throw new Error(result.error ?? "sem order id");
                }
                await supabaseAdmin.from("free_trials").insert({
                  user_id: userId,
                  contact_id: contact.id,
                  conversation_id: conv.id,
                  telefone: phone,
                  link_enviado: link.url,
                  order_id: String(result.order),
                  servico: integ.smm_service_id,
                  quantidade: 100,
                  status: "pending",
                  raw_response: result.raw as never,
                });
                replyText =
                  "Recebi! Já processando suas visualizações... te aviso quando entregar ✅";
              } catch (e) {
                console.error("smm add failed", e);
                replyText =
                  "Tive um probleminha aqui pra processar seu teste agora 😅 já tô resolvendo!";
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
                video?: { enabled?: boolean; url?: string; delay_seconds?: number };
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
              steps.push({
                delayMs: clampDelayMs(s.video.delay_seconds),
                run: async () => {
                  await uazapiSendMedia(creds, phone, "video", url);
                  return { kind: "texto", body: "[vídeo]" };
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
              url: integ.smm_panel_url ?? "https://mindsmmpanel.com/smmpanel/api/v2",
              key: integ.smm_api_key,
            });
            console.log("Serviços carregados:", services.length);
            if (services.length > 0) {
              servicesContext = services
                .slice(0, 200)
                .map((s) => `#${s.service} [${s.category}] ${s.name} — R$ ${s.rate}/1000 (min ${s.min}, max ${s.max})`)
                .join("\n");
            } else {
              servicesFetchFailed = true;
            }
          } catch (e) {
            console.error("smm services fetch failed", e);
            servicesFetchFailed = true;
          }
        }

        let reply: string;
        try {
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
          reply = await generateAgentReply({
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
          });
          }
          if (!reply || !reply.trim()) reply = FALLBACK_REPLY;
        } catch (e) {
          console.error("claude failed", e);
          reply = FALLBACK_REPLY;
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
        const respondWithAudio =
          kind === "audio" &&
          !!integ.elevenlabs_api_key &&
          !!integ.elevenlabs_voice_id &&
          replyParts.length > 0 &&
          !hasHardContent(replyParts[0]);

        const { uazapiSendText, uazapiSendAudio, uazapiSendTyping, uazapiSendRecording, uazapiClearPresence } = await import("@/lib/uazapi.server");
        const sendCreds = { uazapi_url: integ.uazapi_url ?? "", uazapi_token: integ.uazapi_token ?? "" };
        const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

        // Human-like behavior: random delay between min and max, optional typing indicator.
        const a = agent as {
          response_delay_min_sec?: number;
          response_delay_max_sec?: number;
          typing_indicator_enabled?: boolean;
        };
        const minSec = Math.max(0, a.response_delay_min_sec ?? 30);
        const maxSec = Math.max(minSec, a.response_delay_max_sec ?? 180);
        const rawDelayMs = (Math.floor(Math.random() * (maxSec - minSec + 1)) + minSec) * 1000;
        // Cloudflare Worker encerra a request por volta de 30s; mantemos margem
        // para a chamada do Claude + envio via Uazapi caberem na janela.
        const MAX_DELAY_MS = 20000;
        const delayMs = Math.min(rawDelayMs, MAX_DELAY_MS);
        const typingOn = a.typing_indicator_enabled !== false;
        if (delayMs > 0) {
          const presencePromise = typingOn
            ? (respondWithAudio
                ? uazapiSendRecording(sendCreds, phone, delayMs)
                : uazapiSendTyping(sendCreds, phone, delayMs)
              ).catch((e) => {
                console.error(respondWithAudio ? "uazapi recording failed" : "uazapi typing failed", e);
              })
            : Promise.resolve();
          await Promise.all([presencePromise, sleep(delayMs)]);
        }

        let replyKind: "texto" | "audio" = "texto";
        let audioDataUri: string | null = null;
        try {
          if (respondWithAudio) {
            const { ttsElevenLabsBase64 } = await import("@/lib/ai.server");
            // Mantém o "gravando áudio" durante a geração do TTS e durante o envio.
            const [generatedAudio] = await Promise.all([
              ttsElevenLabsBase64({
                apiKey: integ.elevenlabs_api_key!,
                voiceId: integ.elevenlabs_voice_id!,
                text: replyParts[0],
              }),
              uazapiSendRecording(sendCreds, phone, 15000).catch((e) => {
                console.error("uazapi recording failed", e);
              }),
            ]);
            audioDataUri = generatedAudio;
            await Promise.all([
              uazapiSendAudio(sendCreds, phone, audioDataUri),
              uazapiSendRecording(sendCreds, phone, 8000).catch((e) => {
                console.error("uazapi recording failed", e);
              }),
            ]);
            replyKind = "audio";
            // Envia partes adicionais (ex.: link após ===SPLIT===) como texto.
            for (let i = 1; i < replyParts.length; i += 1) {
              await uazapiSendTyping(sendCreds, phone, 1200).catch(() => {});
              await sleep(1200);
              await uazapiSendText(sendCreds, phone, replyParts[i]);
            }
          } else {
            for (let i = 0; i < replyParts.length; i += 1) {
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
            {
              user_id: userId,
              conversation_id: conv.id,
              sender: "agente",
              kind: "audio",
              body: replyParts[0],
              audio_url: audioDataUri,
            },
          ];
          for (let i = 1; i < replyParts.length; i += 1) {
            rows.push({
              user_id: userId,
              conversation_id: conv.id,
              sender: "agente",
              kind: "texto",
              body: replyParts[i],
              audio_url: null,
            });
          }
          await supabaseAdmin.from("messages").insert(rows);
        } else {
          await supabaseAdmin.from("messages").insert(
            replyParts.map((part) => ({
              user_id: userId,
              conversation_id: conv.id,
              sender: "agente",
              kind: "texto",
              body: part,
              audio_url: null,
            })),
          );
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
      },
    },
  },
});