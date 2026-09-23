import { createFileRoute } from "@tanstack/react-router";
import { isConversationAgentEnabledV3 } from "@/lib/agent-v3/brain/config.server";
import { generateTraceId, logExecutionTrace } from "@/lib/agent-v3/telemetry/execution-tracer.server";
import { persistWebhookAgentInboundJob } from "@/lib/agent-v3/inbound-webhook-ownership.server";
import { enqueueWebhookInboundAroundWelcomeFunnel } from "@/lib/agent-v3/inbound-welcome-funnel-gate.server";
import { buildFallbackInboundMessageId } from "@/lib/agent-v3/inbound-message-identity.server";
import { runWelcomeFunnelWebhookGate, webhookGateMustStopAgent } from "@/lib/welcome-funnel-webhook-gate.server";

// Uazapi webhook receiver.
// Configure em Uazapi → Webhooks: POST {site}/api/public/hooks/uazapi-webhook
// Eventos: messages (mensagens recebidas).

// O webhook é somente Stage B/C ingress. Serialização de execução pertence ao
// Customer Turn no banco/dispatcher; nenhum lock em memória desta instância
// participa da garantia ZERO LOST TURN.

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

// STOP, handoff, escalada crítica, silêncio natural e decisão de áudio vivem
// no cérebro/runtime compartilhado. O webhook não mantém cópias dessas regras.

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
    const msgId: string = extractedId ?? buildFallbackInboundMessageId(phoneStr);

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

    // Reações simples não precisam consumir o Agent V3. A mensagem continua
    // registrada no CRM, mas não cria trabalho durável para o runtime.
    if (content.kind === "texto" && isReactionOnlyMessage(content.text)) {
      console.log(`[UAZ-WEBHOOK] [AUDIT] RETORNO: reaction only para msgId ${msgId}`);
      return new Response("ok (reaction only)");
    }

    if (!persistedMessageId || !conversationId) {
      throw new Error("Agent V3 reached without persisted message/conversation id");
    }

    const inboundOwnershipInput = {
      messageId: persistedMessageId,
      conversationId,
      workspaceId,
      sendTarget,
      inputText: content.text || "",
      inputKind: content.kind,
      inputMime: content.mime,
      deferredFunnel: false,
      holder: `turn-ingress:${msgId}:${Date.now()}`,
    } as const;

    // Resolve Agent eligibility before the Funnel gate, but do not let an Agent
    // switch suppress the independent Welcome Funnel. If the Funnel owns the
    // conversation, eligible Agent work is persisted as pending Stage B first.
    let agentGateResponse: Response | null = null;
    const { data: agentConfig, error: agentConfigErr } = await supabaseAdmin
      .from("agent_config")
      .select("agent_enabled")
      .eq("user_id", num.user_id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (agentConfigErr) {
      console.error("[UAZ-WEBHOOK] Failed to read global agent gate:", agentConfigErr);
      agentGateResponse = new Response("retry (agent gate unavailable)", { status: 503 });
    } else if (agentConfig?.agent_enabled === false) {
      console.log(`[UAZ-WEBHOOK] [AUDIT] Agent disabled globally para workspace ${workspaceId}`);
      agentGateResponse = new Response("ok (agent disabled globally)");
    } else if (!(await isConversationAgentEnabledV3(supabaseAdmin, conversationId))) {
      console.log("RETURN-PONTO: agent-disabled", { phone: phoneStr });
      agentGateResponse = new Response("ok (agent disabled for conversation)");
    }

    if (contactId && content.kind === "texto") {
      let funnelGate;
      try {
        funnelGate = await runWelcomeFunnelWebhookGate({
          supabaseAdmin,
          userId: num.user_id,
          workspaceId,
          whatsappNumberId: num.id,
          contactId,
          conversationId,
          phone: sendTarget,
          text: content.text,
          creds: {
            uazapi_url: num.uazapi_url ?? "",
            uazapi_token: instanceToken,
          },
        });
      } catch (funnelError) {
        // The durable runner quarantines uncertain post-send failures as
        // needs_review. Keep this exact inbound pending behind that review fence.
        if (!agentGateResponse) {
          await persistWebhookAgentInboundJob(supabaseAdmin, inboundOwnershipInput);
        }
        console.error("[WELCOME-FUNNEL] Durable orchestration failed closed:", funnelError);
        return new Response("ok (welcome funnel needs review)");
      }

      if (webhookGateMustStopAgent(funnelGate)) {
        // A different customer message received while the Funnel is running or
        // quarantined must keep its own message_id/text pair as pending Stage B.
        // The trigger message itself is consumed only after durable completion.
        const completedTrigger =
          funnelGate.status === "matched" &&
          funnelGate.orchestration.status === "completed";
        if (!agentGateResponse && !completedTrigger) {
          await persistWebhookAgentInboundJob(supabaseAdmin, inboundOwnershipInput);
        }

        console.log("[WELCOME-FUNNEL] Agent V3 bloqueado pelo gate durável", {
          status: funnelGate.status,
          detail:
            funnelGate.status === "matched"
              ? funnelGate.orchestration.status
              : funnelGate.status === "conversation_blocked"
                ? funnelGate.barrier
                : funnelGate.status === "query_unavailable"
                  ? funnelGate.error
                  : null,
        });
        const funnelRetryRequired =
          funnelGate.status === "query_unavailable" ||
          (funnelGate.status === "matched" &&
            funnelGate.orchestration.status === "busy");
        return new Response(
          funnelRetryRequired
            ? "retry (welcome funnel gate unavailable or busy)"
            : "ok (welcome funnel gate)",
          { status: funnelRetryRequired ? 503 : 200 },
        );
      }
    }

    if (agentGateResponse) return agentGateResponse;


    // Duplicata do provedor não prova que o Agent V3 já processou a mensagem.
    // Depois de todos os gates de elegibilidade, o job durável é a fonte de
    // verdade: retry pode reparar o crash entre persistir messages e criar job.
    if (isDuplicateInMemory || isDuplicateDelivery) {
      console.log(`[UAZ-WEBHOOK] [AUDIT] Retry elegível seguirá até ownership durável: ${msgId}`);
    }

    // 5. DURABLE CUSTOMER TURN INGRESS (Stage C+D). Recheck the durable
    // Funnel barrier atomically close to attachment: a newly running/review
    // Funnel leaves this exact message as pending Stage B instead of losing it.
    const ownershipResult = await enqueueWebhookInboundAroundWelcomeFunnel(
      supabaseAdmin,
      inboundOwnershipInput,
    );

    if (ownershipResult.status === "pending_behind_funnel") {
      console.log("[AGENT-CUSTOMER-TURN] inbound durável aguardando Welcome Funnel", {
        phone: phoneStr,
        messageId: persistedMessageId,
        jobId: ownershipResult.jobId,
        barrier: ownershipResult.barrier,
        duplicate: ownershipResult.duplicate,
      });
      return new Response("ok (agent inbound pending behind welcome funnel)");
    }

    console.log("[AGENT-CUSTOMER-TURN] inbound anexado ao turno durável", {
      phone: phoneStr,
      messageId: persistedMessageId,
      jobId: ownershipResult.jobId,
      turnId: ownershipResult.turnId,
      duplicate: ownershipResult.duplicate,
    });

    // Acknowledge the provider immediately after durable ownership is committed.
    // Customer Turn quiet-period aggregation and Agent V3 execution belong to the
    // dispatcher/recovery workers; keeping them on the webhook request path can
    // exceed the provider timeout and cause unnecessary redelivery.
    return new Response("ok (agent customer turn durable)");
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
