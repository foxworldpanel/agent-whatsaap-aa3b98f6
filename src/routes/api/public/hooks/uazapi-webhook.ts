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

// Contador em memória por messageId — mostra quantas vezes o Uazapi
// disparou o webhook para a mesma mensagem dentro da vida do worker.
const messageIdHits = new Map<string, number>();
function bumpMessageIdHit(id: string): number {
  const n = (messageIdHits.get(id) ?? 0) + 1;
  messageIdHits.set(id, n);
  if (messageIdHits.size > 1000) {
    // GC oportunista: mantém somente as últimas 500
    const keys = Array.from(messageIdHits.keys()).slice(0, messageIdHits.size - 500);
    for (const k of keys) messageIdHits.delete(k);
  }
  return n;
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
    imageMessage?: unknown;
    stickerMessage?: unknown;
    caption?: string;
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

function extractContent(p: UazapiPayload): { text: string; kind: "texto" | "audio" | "image" | "sticker" } {
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
  const isSticker =
    type.includes("sticker") ||
    type.includes("figurinha") ||
    !!m.stickerMessage;
  if (isSticker) {
    const caption = (m.caption ?? m.text ?? m.content ?? "").trim();
    return { text: caption || "[figurinha recebida]", kind: "sticker" };
  }
  const isImage =
    type.includes("image") || type.includes("imagem") || mime.startsWith("image/") || !!m.imageMessage;
  if (isImage) {
    const caption = (m.caption ?? m.text ?? "").trim();
    return { text: caption || "[imagem recebida]", kind: "image" };
  }
  return { text: m.text ?? m.content ?? "", kind: "texto" };
}

function extractMediaUrl(p: UazapiPayload): string | null {
  const m = p.message ?? p.data ?? {};
  return m.mediaUrl ?? null;
}

function extractAudioSeconds(p: UazapiPayload): number | null {
  const m = (p.message ?? p.data ?? {}) as Record<string, unknown>;
  const candidates: unknown[] = [
    m.seconds,
    m.duration,
    m.audioSeconds,
    (m.audioMessage as Record<string, unknown> | undefined)?.seconds,
    (m.pttMessage as Record<string, unknown> | undefined)?.seconds,
  ];
  for (const c of candidates) {
    const n = typeof c === "number" ? c : typeof c === "string" ? parseFloat(c) : NaN;
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function extractMessageId(p: UazapiPayload): string | null {
  const m = p.message ?? p.data ?? {};
  return m.messageid ?? m.messageId ?? m.id ?? null;
}

// Fallback determinístico quando o payload não traz messageId.
// Combina telefone + conteúdo + bucket de 10s para que reentregas
// do mesmo evento caiam na mesma chave e sejam bloqueadas pelo PK.
function buildFallbackMessageId(phone: string, content: string): string {
  const bucket = Math.floor(Date.now() / 10000); // 10s
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) - hash + content.charCodeAt(i)) | 0;
  }
  return `fb:${phone}:${bucket}:${(hash >>> 0).toString(36)}`;
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

function compactHumanText(text: string): string {
  return normalizeText(text ?? "")
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isEmojiOnly(text: string): boolean {
  const raw = (text ?? "").trim();
  if (!raw) return false;
  const withoutEmoji = raw
    .replace(/[\s\uFE0F\u200D\u{1F3FB}-\u{1F3FF}]/gu, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[\p{Regional_Indicator}]/gu, "");
  return withoutEmoji.length === 0;
}

function isConfirmationEmojiOnly(text: string): boolean {
  const rest = (text ?? "")
    .trim()
    .replace(/[\s\uFE0F\u200D\u{1F3FB}-\u{1F3FF}]/gu, "")
    .replace(/[👍👌✅☑✔👏🙏]/gu, "");
  return rest.length === 0 && (text ?? "").trim().length > 0;
}

function isShortConfirmationText(text: string): boolean {
  const t = compactHumanText(text);
  if (!t || t.length > 24) return false;
  return /^(ok|okay|blz|beleza|show|top|valeu|obrigado|obrigada|certo|ta bom|tudo bem|aham|uhum|entendi|tranquilo|tmj|perfeito)$/i.test(t);
}

function isDeferredDecisionText(text: string): boolean {
  if (isDirectClientQuestion(text)) return false;
  const t = normalizeText(text ?? "");
  return /\b(vou\s+(ver|analisar|olhar|pensar|decidir|avaliar|comparar|pesquisar)|vou\s+dar\s+uma\s+(olhada|analisada|pensada)|vou\s+ver\s+(certinho|direitinho|com\s+calma)|vou\s+pensar\s+(melhor|com\s+calma)|depois\s+(eu\s+)?(vejo|olho|decido|resolvo|te\s+(chamo|falo|aviso))|deixo\s+pra\s+depois|te\s+(aviso|falo|chamo)|mais\s+tarde|amanha|preciso\s+(ver|pensar|analisar|avaliar|decidir)|deixa\s+eu\s+(ver|pensar|analisar|avaliar|decidir)|qualquer\s+coisa\s+(eu\s+)?(te\s+)?chamo)\b/i.test(t);
}

function waitingClosureAlreadySent(text: string): boolean {
  const t = normalizeText(text ?? "");
  return /qualquer\s+coisa.*me\s+chama|me\s+chama.*qualquer\s+coisa|fico\s+no\s+aguardo|vou\s+ficar\s+no\s+aguardo|certo.*aguardo|quando\s+(decidir|escolher)|sem\s+pressa|te\s+aguardo|me\s+avisa/.test(t);
}

function minimalReactionAlreadySent(text: string): boolean {
  const t = compactHumanText(text);
  return isEmojiOnly(text) || t === "show" || t === "ok" || t === "beleza";
}

function getMinimalReactionReply(kind: "texto" | "audio" | "image" | "sticker", text: string): string | null | undefined {
  if (kind === "sticker" && (text ?? "").trim() === "[figurinha recebida]") return "😊";
  if (isConfirmationEmojiOnly(text) || isShortConfirmationText(text)) return null;
  if (isEmojiOnly(text)) return "😊";
  return undefined;
}

function isBareAcknowledgementPart(text: string): boolean {
  const t = compactHumanText(text);
  return /^(ta bom|certo|beleza|show|ok|okay|combinado|tranquilo|sem problemas|perfeito)$/i.test(t);
}

function collapseRedundantWaitingParts(parts: string[], inboundText: string): string[] {
  if (parts.length <= 1) return parts;
  const hasWaitingClosure = parts.some((part) => waitingClosureAlreadySent(part));
  if (!hasWaitingClosure) return parts;

  const onlyClosureOrAck = parts.every(
    (part) => waitingClosureAlreadySent(part) || isBareAcknowledgementPart(part),
  );

  // Se o cliente disse que vai ver/analisar/decidir depois, a resposta deve ser
  // uma única mensagem canônica — nunca "Tá bom" + "fico no aguardo" em split.
  if (isDeferredDecisionText(inboundText) || onlyClosureOrAck) {
    return ["Tá bom! Qualquer coisa me chama 😊"];
  }

  const out: string[] = [];
  let emittedWaitingClosure = false;
  for (const part of parts) {
    const isWaiting = waitingClosureAlreadySent(part);
    if (isWaiting) {
      if (emittedWaitingClosure) continue;
      emittedWaitingClosure = true;
    }
    if (emittedWaitingClosure && !isWaiting && isBareAcknowledgementPart(part)) continue;
    out.push(part);
  }
  return out;
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
// Frases típicas de lead morno — NUNCA pausa, é interesse real adiado.
const WARM_LEAD_RE = /\b(vou pensar|vou ver|vou resolver|volto depois|te aviso|te falo|qualquer coisa|mais tarde|amanha|amanhã|semana que vem|depois eu vejo|deixa eu pensar|preciso pensar)\b/i;
function isWarmLead(body: string): boolean {
  return WARM_LEAD_RE.test(body ?? "");
}
// Mensagem completamente sem sentido (gibberish). Conservador: só marca quando
// claramente não há palavra real — evita falsos positivos em conversa engajada.
function isNonsense(body: string): boolean {
  const raw = (body ?? "").trim();
  if (!raw) return false;
  if (raw.length < 3) return false;
  const t = normalizeText(raw);
  if (/\?/.test(raw)) return false;
  if (SMM_KEYWORDS.some((k) => t.includes(k))) return false;
  // Sem nenhuma letra (só símbolos/dígitos isolados) → nonsense.
  if (!/[a-z]/i.test(t)) return true;
  // Token único, longo, sem vogais (ex.: "sdfghj").
  if (!/\s/.test(t) && t.length >= 5 && !/[aeiou]/i.test(t)) return true;
  // String longa com pouquíssima diversidade ("aaaaaaa", "kkkkkkk").
  const letters = t.replace(/[^a-z]/g, "");
  if (letters.length >= 6 && new Set(letters).size <= 2) return true;
  return false;
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
  currentKind: "texto" | "audio" | "image" | "sticker",
): { reason: string } | null {
  // 1) Ofensa / xingamento direto — bloqueio imediato.
  if (OFFENSIVE_RE.test(currentText ?? "")) {
    return { reason: "Mensagem ofensiva detectada" };
  }
  // 2) Guarda de engajamento: qualquer pergunta, tema de SMM/preço/plataforma
  // ou sinal de lead morno ("vou pensar", "volto depois") NUNCA pausa.
  const currentBody = currentText ?? "";
  if (
    /\?/.test(currentBody) ||
    isOnTopic(currentBody) ||
    isWarmLead(currentBody)
  ) {
    return null;
  }
  // Junta a mensagem atual ao histórico recente (mais antiga → mais nova).
  const recent = [...clientMsgs.slice(-6), { body: currentBody, kind: currentKind }];
  // 3) 5+ figurinhas/imagens seguidas sem nenhum texto.
  const last5 = recent.slice(-5);
  const stickerStreak = last5.filter((m) => m.kind === "sticker" || m.kind === "image").length;
  if (last5.length >= 5 && stickerStreak >= 5) {
    return { reason: "5+ figurinhas/imagens seguidas sem texto" };
  }
  // 4) 3 mensagens completamente sem sentido seguidas.
  const last3Text = recent.filter((m) => m.kind === "texto" && (m.body ?? "").trim().length > 0).slice(-3);
  if (last3Text.length >= 3 && last3Text.every((m) => isNonsense(m.body))) {
    return { reason: "3 mensagens sem sentido seguidas" };
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
        // Para o DB (enum message_kind = texto|audio) e fluxos legados,
        // tratamos imagem como "texto". O flag `isImage` controla a chamada
        // ao Claude Sonnet com visão.
        const dbKind: "texto" | "audio" = kind === "audio" ? "audio" : "texto";
        const isImage = kind === "image";
        console.log('=== INÍCIO DO PROCESSAMENTO ===');
        console.log('Mensagem recebida:', { text, kind, phone: extractPhone(payload.message?.chatid, payload.message?.sender), messageId: extractMessageId(payload) });
        try {
          const { logEvent } = await import("@/lib/agent-logger.server");
          await logEvent({ phone: extractPhone(payload.message?.chatid, payload.message?.sender), type: "message_received", level: "info", summary: `📩 Mensagem recebida (${kind}): ${(text ?? "").slice(0, 80)}`, metadata: { kind, messageId: extractMessageId(payload) } });
        } catch {}
        let mediaUrl = extractMediaUrl(payload);
        let messageId = extractMessageId(payload);
        // Sem messageId real → cria chave determinística por phone+conteúdo+bucket
        // para que reentregas do mesmo evento sejam bloqueadas mesmo assim.
        if (!messageId) {
          const contentSig = (text ?? "") + "|" + (mediaUrl ?? "") + "|" + kind;
          messageId = buildFallbackMessageId(phone, contentSig);
        }
        if (!text && kind !== "audio" && kind !== "image") return new Response("empty");

        // Áudios muito curtos (<1s) são ruído acidental — ignora sem responder
        if (kind === "audio") {
          const secs = extractAudioSeconds(payload);
          if (secs !== null && secs < 1) {
            try {
              const { logEvent } = await import("@/lib/agent-logger.server");
              await logEvent({
                phone: extractPhone(payload.message?.chatid, payload.message?.sender),
                type: "audio_ignored_short",
                level: "info",
                summary: `🔇 Áudio curto ignorado (${secs.toFixed(2)}s < 1s)`,
                metadata: { seconds: secs, messageId },
              });
            } catch {}
            return new Response("ignored: short audio");
          }
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // ===== Idempotência por messageId =====
        // Uazapi às vezes dispara o mesmo evento mais de uma vez. Trava
        // definitiva: UPSERT com ignoreDuplicates na tabela processed_messages
        // (PK message_id). Se nada foi inserido → já processado, ignora.
        if (messageId) {
          const hits = bumpMessageIdHit(messageId);
          console.log(`🔁 Webhook hit #${hits} para messageId=${messageId}`);
          if (hits > 1) {
            try {
              const { logEvent } = await import("@/lib/agent-logger.server");
              await logEvent({ phone, type: "webhook_replay", level: "warn", summary: `🔁 Uazapi reenviou messageId (${hits}x): ${messageId}`, metadata: { messageId, hits } });
            } catch {}
            return new Response("ok (in-memory duplicate)");
          }

          const { data: inserted, error: dupErr } = await supabaseAdmin
            .from("processed_messages")
            .upsert({ message_id: messageId }, { onConflict: "message_id", ignoreDuplicates: true })
            .select("message_id");
          if (dupErr) {
            // erro inesperado (não é conflito): loga e segue — não bloqueia atendimento
            console.warn("processed_messages upsert error:", dupErr.message);
          } else if (!inserted || inserted.length === 0) {
            // Nada inserido = messageId já existia → duplicata bloqueada
            console.log(`🚫 Duplicata bloqueada (processed_messages): ${messageId}`);
            try {
              const { logEvent } = await import("@/lib/agent-logger.server");
              await logEvent({ phone, type: "duplicate_blocked", level: "warn", summary: `🚫 Mensagem duplicada bloqueada (${messageId})`, metadata: { messageId } });
            } catch {}
            return new Response("ok (duplicate messageId)");
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

        // 🧪 Números de teste — ignora todas as travas de negócio
        let isTestNumber = false;
        try {
          const { data: tn } = await supabaseAdmin
            .from("test_numbers")
            .select("id")
            .eq("user_id", userId)
            .eq("phone", phone)
            .maybeSingle();
          isTestNumber = !!tn;
          if (isTestNumber) {
            console.log(`🧪 Modo teste ativo para ${phone} — travas ignoradas`);
            try {
              const { logEvent } = await import("@/lib/agent-logger.server");
              await logEvent({
                userId,
                phone,
                type: "test_number",
                level: "info",
                summary: `🧪 Modo teste ativo para ${phone} — travas ignoradas`,
              });
            } catch {}
          }
        } catch {}

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
          // Se é lead Meta Ads, registra também na Lista A (Meta Ads) para histórico/anti-dup
          if (effectiveSource?.source === "meta_ads" && !isTestNumber) {
            try {
              const { data: listA } = await supabaseAdmin
                .from("contact_lists")
                .select("id")
                .eq("user_id", userId)
                .eq("origem", "meta_ads")
                .maybeSingle();
              let listAId = listA?.id;
              if (!listAId) {
                const ins = await supabaseAdmin
                  .from("contact_lists")
                  .insert({ user_id: userId, name: "Lista A — Meta Ads", origem: "meta_ads" })
                  .select("id")
                  .single();
                listAId = ins.data?.id;
              }
              if (listAId) {
                const { data: dup } = await supabaseAdmin
                  .from("blast_contacts")
                  .select("id")
                  .eq("user_id", userId)
                  .eq("telefone", phone)
                  .maybeSingle();
                if (!dup) {
                  await supabaseAdmin.from("blast_contacts").insert({
                    user_id: userId,
                    contact_list_id: listAId,
                    origem: "meta_ads",
                    nome: msg.senderName ?? phone,
                    telefone: phone,
                    instagram: "",
                    status: "respondeu",
                    replied_at: new Date().toISOString(),
                  });
                }
              }
            } catch {}
          }
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

        // Detecta se esta mensagem é resposta a um disparo ativo.
        // Se sim, o agente Júlia assume a conversa diretamente — sem funil.
        let isBlastReply = false;
        let blastDispatchMode: "agente_livre" | "fluxo_visual" = "agente_livre";
        try {
          const { data: pendingBlast } = await supabaseAdmin
            .from("blast_contacts")
            .select("id, status, campaign_id")
            .eq("user_id", userId)
            .eq("telefone", phone)
            .in("status", ["enviado_abertura", "enviado_d3", "enviado_d7"])
            .limit(1);
          isBlastReply = !!(pendingBlast && pendingBlast.length > 0);
          if (isBlastReply) {
            const campId = (pendingBlast?.[0] as { campaign_id?: string | null } | undefined)?.campaign_id;
            if (campId) {
              const { data: campRow } = await supabaseAdmin
                .from("blast_campaigns")
                .select("dispatch_mode")
                .eq("id", campId)
                .maybeSingle();
              const m = (campRow as { dispatch_mode?: string | null } | null)?.dispatch_mode;
              if (m === "fluxo_visual" || m === "agente_livre") blastDispatchMode = m;
            }
            await supabaseAdmin
              .from("blast_contacts")
              .update({ status: "respondeu", replied_at: new Date().toISOString() })
              .eq("user_id", userId)
              .eq("telefone", phone)
              .in("status", ["enviado_abertura", "enviado_d3", "enviado_d7", "pendente"]);
          }
        } catch {}

        if (contact.status === "bloqueado" && !isTestNumber) {
          return new Response("ok (blocked)");
        }

        let { data: conv } = await supabaseAdmin
          .from("conversations")
          .select("id, agent_enabled, whatsapp_number_id, needs_review")
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
            .select("id, agent_enabled, whatsapp_number_id, needs_review")
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
          kind: dbKind,
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

        // ===== Trava de funil em execução =====
        // Se o funil de boas-vindas ainda está rodando para essa conversa,
        // a mensagem do cliente já foi salva no histórico acima — não chama
        // o Claude agora. Quando o funil terminar, a próxima mensagem do
        // cliente é processada normalmente com todo o histórico.
        {
          const { data: convState } = await supabaseAdmin
            .from("conversations")
            .select("funnel_status")
            .eq("id", conv.id)
            .maybeSingle();
          if ((convState as { funnel_status?: string } | null)?.funnel_status === "running") {
            console.log("⏳ Funil ainda rodando — mensagem do cliente salva mas Claude não será chamado.");
            try {
              const { logEvent } = await import("@/lib/agent-logger.server");
              await logEvent({ userId, phone, conversationId: conv.id, type: "funnel_in_progress", level: "info", summary: "Mensagem ignorada pelo Claude — funil de boas-vindas em execução" });
            } catch {}
            return new Response("ok (funnel running)");
          }
        }

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
            .update({
              status: "aguardando",
              agent_enabled: false,
              needs_review: true,
              review_reason: "Cliente pediu para parar",
              auto_paused_at: now,
            })
            .eq("id", conv.id);
          return new Response("ok (stop → blocked)");
        }

        const { data: agent } = await supabaseAdmin
          .from("agent_config")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle();
        if (!agent) {
          await supabaseAdmin.from("conversations").update({ status: "aguardando" }).eq("id", conv.id);
          return new Response("ok (no agent config)");
        }

        // Guard absoluto: se o agente global, a conversa ou a revisão estiverem desligados,
        // salva a mensagem recebida, mas bloqueia QUALQUER resposta automática abaixo
        // (teste grátis, funil, IA, áudio, etc.).
        const globalEnabled = (agent as { agent_enabled?: boolean }).agent_enabled !== false;
        const convEnabled = conv.agent_enabled !== false;
        const needsReview = (conv as { needs_review?: boolean }).needs_review === true;
        const isAutoReplyAllowed = async (): Promise<boolean> => {
          const { data: latestAgent } = await supabaseAdmin
            .from("agent_config")
            .select("agent_enabled")
            .eq("user_id", userId)
            .maybeSingle();
          if (latestAgent?.agent_enabled === false) return false;

          const { data: latestConv } = await supabaseAdmin
            .from("conversations")
            .select("agent_enabled, needs_review")
            .eq("id", conv.id)
            .maybeSingle();
          if (latestConv?.agent_enabled === false || latestConv?.needs_review === true) return false;

          const { data: latestContact } = await supabaseAdmin
            .from("contacts")
            .select("status")
            .eq("id", contact.id)
            .maybeSingle();
          return latestContact?.status !== "bloqueado";
        };
        if (!globalEnabled || !convEnabled || needsReview) {
          await supabaseAdmin
            .from("conversations")
            .update({
              status: "aguardando",
              ...(!globalEnabled || needsReview ? { agent_enabled: false } : {}),
            })
            .eq("id", conv.id);
          try {
            const { logEvent } = await import("@/lib/agent-logger.server");
            await logEvent({
              userId,
              phone,
              conversationId: conv.id,
              type: "agent_disabled",
              level: "info",
              summary: !globalEnabled
                ? "Agente global desativado — resposta automática bloqueada"
                : needsReview
                  ? "Conversa em revisão — resposta automática bloqueada"
                  : "Agente da conversa desativado — resposta automática bloqueada",
              metadata: { globalEnabled, convEnabled, needsReview },
            });
          } catch {}
          return new Response("ok (agent disabled)");
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
                  {
                    const l = (lastTrial.link_enviado ?? "").toLowerCase();
                    const local = /youtube\.com|youtu\.be/.test(l)
                      ? "no seu vídeo do YouTube"
                      : /tiktok\.com/.test(l)
                        ? "no seu vídeo do TikTok"
                        : /spotify\.com|spotify\.link/.test(l)
                          ? "na sua música"
                          : "no seu Reel";
                    replyText = `Aqui mostra que foi entregue! Às vezes leva alguns minutos pra atualizar. Se em 1 hora não aparecer, abre um ticket no painel no menu Suporte! Dá uma olhada agora ${local}`;
                  }
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
              if (!(await isAutoReplyAllowed())) return new Response("ok (auto-reply disabled before free trial complaint)");
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
                    if (completedThis && !isTestNumber) {
                      const replyText = `Você já recebeu seu teste grátis de ${platformMatch.label}! Posso te montar um pacote completo agora?`;
                      if (!(await isAutoReplyAllowed())) return new Response("ok (auto-reply disabled before trial-used)");
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
            // ===== Gate: só processa teste grátis automático se houver
            // contexto explícito de pedido de teste ou medo/receio. Link
            // solto nunca dispara teste — o agente deve perguntar primeiro
            // "esse é seu vídeo? o que quer impulsionar?".
            const trialIntentRx = /\b(teste\s*gr[aá]tis|amostra\s*gr[aá]tis|quero\s+(o\s+)?teste|posso\s+(fazer|ter|ganhar)\s+(um\s+)?teste|me\s+d[aá]\s+(um\s+)?teste|tem\s+teste|libera\s+(o\s+)?teste|free\s*trial|uma\s+amostra)\b/i;
            const fearRx = /\b(golpe|fraude|confi[aá]vel|seguro|medo|receio|desconfi|enganaç|é\s+verdade|é\s+real|funciona\s+mesmo|prova|comprovaç)/i;
            let trialContextActive = trialIntentRx.test(inboundBody) || fearRx.test(inboundBody);
            if (!trialContextActive) {
              const { data: recent } = await supabaseAdmin
                .from("messages")
                .select("sender, body")
                .eq("conversation_id", conv.id)
                .order("created_at", { ascending: false })
                .limit(8);
              for (const m of recent ?? []) {
                const b = (m.body ?? "") as string;
                if (m.sender === "cliente" && (trialIntentRx.test(b) || fearRx.test(b))) {
                  trialContextActive = true; break;
                }
                if (m.sender === "agente" && /teste\s*gr[aá]tis|amostra\s*gr[aá]tis|mandar?\s+(um\s+)?teste/i.test(b)) {
                  trialContextActive = true; break;
                }
              }
            }
            if (!trialContextActive) {
              console.log(`[free-trial] Link recebido sem contexto de teste — deixando IA conduzir (phone=${phone})`);
              // Não processa teste automático; fluxo segue para IA responder.
            } else {
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
                if (!(await isAutoReplyAllowed())) return new Response("ok (auto-reply disabled before trial photo)");
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
            const existingTrial = isTestNumber ? null : (phoneCompleted || linkCompleted);

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
                {
                  const unidade =
                    link.platform === "spotify"
                      ? "plays"
                      : matched?.category?.toLowerCase().includes("segui")
                        ? "seguidores"
                        : matched?.category?.toLowerCase().includes("curt") ||
                            matched?.category?.toLowerCase().includes("like")
                          ? "curtidas"
                          : matched?.category?.toLowerCase().includes("inscri")
                            ? "inscritos"
                            : "views";
                  const local =
                    link.platform === "youtube"
                      ? "no seu vídeo do YouTube"
                      : link.platform === "tiktok"
                        ? "no seu vídeo do TikTok"
                        : link.platform === "spotify"
                          ? "na sua música"
                          : "no seu Reel";
                  replyText = `Recebi! Já liberei ${qty} ${unidade} grátis ${local}, costuma chegar em poucos minutos ✅`;
                }
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
              if (!(await isAutoReplyAllowed())) return new Response("ok (auto-reply disabled before free trial)");
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
        }

        // "Modo Disparos": número usado para abordagem ativa — não responde inbound.
        if (disparosMode) return new Response("ok (disparos mode: no auto-reply)");

        // ===== Respostas mínimas: emoji/figurinha/reações e "vou ver depois" =====
        // Roda antes de funil e Claude para não disparar fluxo automático em
        // confirmações curtas, figurinhas ou adiamentos sem nova dúvida.
        {
          const minimalReactionReply = getMinimalReactionReply(kind, inboundBody);
          const deferredDecision = isDeferredDecisionText(inboundBody);
          if (minimalReactionReply !== undefined || deferredDecision) {
            const { data: lastAgentMsg } = await supabaseAdmin
              .from("messages")
              .select("body")
              .eq("conversation_id", conv.id)
              .eq("sender", "agente")
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            const lastAgentBody = ((lastAgentMsg as { body?: string } | null)?.body ?? "") as string;
            let directReply: string | null = deferredDecision ? "Tá bom! Qualquer coisa me chama 😊" : minimalReactionReply ?? null;

            if (deferredDecision && waitingClosureAlreadySent(lastAgentBody)) directReply = null;
            if (!deferredDecision && directReply && minimalReactionAlreadySent(lastAgentBody)) directReply = null;

            if (directReply) {
              if (!(await isAutoReplyAllowed())) return new Response("ok (auto-reply disabled before minimal reply)");
              if (!(memWasRecentlySent(phone, directReply) || await wasRecentlySent(conv.id, directReply))) {
                const { uazapiSendText } = await import("@/lib/uazapi.server");
                const creds = { uazapi_url: integ.uazapi_url ?? "", uazapi_token: integ.uazapi_token ?? "" };
                memMarkSent(phone, directReply);
                await uazapiSendText(creds, phone, directReply);
                const stamp = new Date().toISOString();
                await supabaseAdmin.from("messages").insert({
                  user_id: userId,
                  conversation_id: conv.id,
                  sender: "agente",
                  kind: "texto",
                  body: directReply,
                });
                await supabaseAdmin
                  .from("conversations")
                  .update({ last_message_preview: directReply.slice(0, 120), last_message_at: stamp, status: "aguardando" })
                  .eq("id", conv.id);
                await supabaseAdmin
                  .from("contacts")
                  .update({ last_interaction_at: stamp, status: "em_conversa" })
                  .eq("id", contact.id);
                try {
                  const { logEvent } = await import("@/lib/agent-logger.server");
                  await logEvent({ userId, phone, conversationId: conv.id, type: "minimal_reply", level: "info", summary: `Resposta mínima enviada: ${directReply}`, metadata: { kind, inboundBody, deferredDecision } });
                } catch {}
                return new Response("ok (minimal reply)");
              }
            }

            await supabaseAdmin.from("conversations").update({ status: "aguardando" }).eq("id", conv.id);
            try {
              const { logEvent } = await import("@/lib/agent-logger.server");
              await logEvent({ userId, phone, conversationId: conv.id, type: "minimal_reply", level: "info", summary: "Reação curta sem resposta automática", metadata: { kind, inboundBody, deferredDecision } });
            } catch {}
            return new Response("ok (short reaction ignored)");
          }
        }

        // ===== Resposta a disparo: agente Júlia assume =====
        // Se o cliente respondeu ao disparo dizendo NÃO / sem interesse,
        // envia despedida curta e marca como perdido — sem acionar o agente.
        if (isBlastReply) {
          const negRe = /^\s*(n[aã]o(\s+(quero|tenho|preciso|obrigad[oa]|me\s+manda|me\s+chame|interess[ae]|gost))?|para|pare|sai|remov|bloqu|n[aã]o\s+me\s+mand|sem\s+interesse|n[aã]o\s+t[oô]\s+interess)/i;
          if (negRe.test((text ?? inboundBody ?? "").trim())) {
            try {
              const goodbye = "Tudo bem, desculpa o incômodo! Se precisar no futuro é só chamar 😊";
              const { uazapiSendText } = await import("@/lib/uazapi.server");
              await uazapiSendText(
                { uazapi_url: integ.uazapi_url ?? numberUazapiUrl ?? "", uazapi_token: instanceToken },
                phone,
                goodbye,
              );
              const stamp = new Date().toISOString();
              await supabaseAdmin.from("messages").insert({
                user_id: userId,
                conversation_id: conv.id,
                sender: "agente",
                kind: "texto",
                body: goodbye,
              });
              await supabaseAdmin
                .from("conversations")
                .update({ agent_enabled: false, status: "aguardando", last_message_preview: goodbye.slice(0, 120), last_message_at: stamp })
                .eq("id", conv.id);
              await supabaseAdmin.from("contacts").update({ status: "sem_resposta" }).eq("id", contact.id);
              await supabaseAdmin
                .from("blast_contacts")
                .update({ status: "perdido" })
                .eq("user_id", userId)
                .eq("telefone", phone);
            } catch (e) {
              console.error("[blast-no] goodbye failed", e);
            }
            return new Response("ok (blast declined)");
          }
        }

        // ===== Funis de boas-vindas (múltiplos por número; primeiro gatilho que casar dispara, uma vez por contato) =====
        // Se a mensagem é resposta a disparo, o agente Júlia assume direto — pula funil.
        if (numberId && !isDirectClientQuestion(inboundBody) && !isBlastReply) {
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
                  if (!(await isAutoReplyAllowed())) throw new Error("__auto_reply_disabled__");
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
                  if (!(await isAutoReplyAllowed())) throw new Error("__auto_reply_disabled__");
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
                  if (!(await isAutoReplyAllowed())) throw new Error("__auto_reply_disabled__");
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
                  if (!(await isAutoReplyAllowed())) throw new Error("__auto_reply_disabled__");
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
                  if (!(await isAutoReplyAllowed())) throw new Error("__auto_reply_disabled__");
                  await uazapiSendText(creds, phone, text);
                  return { kind: "texto", body: text };
                },
              });
            }

            let lastBody = "";
            // Marca a conversa como "funil rodando" para que mensagens
            // do cliente recebidas durante a entrega não disparem o Claude.
            await supabaseAdmin
              .from("conversations")
              .update({ funnel_status: "running" })
              .eq("id", conv.id);
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
                  funnel_status: "completed",
                })
                .eq("id", conv.id);
              await supabaseAdmin
                .from("contacts")
                .update({ last_interaction_at: stamp, status: "em_conversa" })
                .eq("id", contact.id);
              return new Response("ok (welcome funnel)");
            }
          } catch (e) {
            // Libera a trava se o funil falhar/parar no meio para não travar
            // a conversa para sempre.
            try {
              await supabaseAdmin
                .from("conversations")
                .update({ funnel_status: "completed" })
                .eq("id", conv.id);
            } catch {}
            if ((e as Error)?.message === "__auto_reply_disabled__") {
              return new Response("ok (auto-reply disabled during welcome funnel)");
            }
            if ((e as Error)?.message !== "__skip_funnel__") {
              console.error("welcome funnel failed", e);
            }
          }
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
          const currentUnproductiveKind = kind === "sticker" || kind === "image" ? kind : dbKind;
          const detected = detectUnproductive(priorWithoutCurrent, inboundBody, currentUnproductiveKind);
          if (detected) {
            const stamp = new Date().toISOString();
            await supabaseAdmin
              .from("conversations")
              .update({
                needs_review: true,
                review_reason: detected.reason,
                auto_paused_at: stamp,
                agent_enabled: false,
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
        // If the owner uploaded new screenshots through the Agent IA card, we analyze
        // them with Claude Vision only when the customer asks something about the panel.
        const shouldUsePanelGuide = /painel|cadastro|cadastrar|conta|login|entrar|saldo|dep[oó]sito|pix|pedido|servi[çc]o|menu|bot[aã]o|onde clic|como faço|como usar/i.test(inboundBody ?? "");
        const { data: pgRows } = await supabaseAdmin
          .from("panel_guide")
          .select("id, name, description, image_url, extracted_content, storage_path")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(30);
        const panelScreens: Array<{ name: string; description: string | null; extracted_content: string | null }> = [];
        for (const row of pgRows ?? []) {
          const r = row as {
            id: string;
            name: string;
            description: string | null;
            image_url: string;
            extracted_content: string | null;
            storage_path?: string | null;
          };
          let extracted = r.extracted_content;
          if (shouldUsePanelGuide && !extracted && r.image_url) {
            try {
              let imageUrl = r.image_url;
              if (r.storage_path) {
                const { data: signed } = await supabaseAdmin.storage
                  .from("panel-guide")
                  .createSignedUrl(r.storage_path, 60 * 60);
                if (signed?.signedUrl) imageUrl = signed.signedUrl;
              }
              const { describePanelScreen } = await import("@/lib/ai.server");
              extracted = await describePanelScreen({
                imageUrl,
                name: r.name,
                description: r.description,
              });
              if (extracted) {
                await supabaseAdmin
                  .from("panel_guide")
                  .update({ extracted_content: extracted } as never)
                  .eq("id", r.id);
              }
            } catch (e) {
              console.error("panel guide vision analysis failed", e);
            }
          }
          panelScreens.push({
            name: r.name,
            description: r.description,
            extracted_content: extracted,
          });
        }
        const appendConfigScreens = async (
          slot: "mobile" | "desktop",
          rawItems: unknown,
        ) => {
          if (!Array.isArray(rawItems)) return;
          for (const [index, item] of rawItems.entries()) {
            const shot = item as { url?: string; path?: string; label?: string };
            if (!shot.url && !shot.path) continue;
            const name = shot.label?.trim() || `${slot === "mobile" ? "Celular" : "Desktop"} ${index + 1}`;
            if (panelScreens.some((s) => s.name === name)) continue;
            const description = slot === "mobile" ? "Print do painel aberto no celular" : "Print do painel aberto no desktop/PC";
            let extracted: string | null = null;
            if (shouldUsePanelGuide) {
              try {
                let imageUrl = shot.url ?? "";
                if (shot.path) {
                  const { data: signed } = await supabaseAdmin.storage
                    .from("panel-guide")
                    .createSignedUrl(shot.path, 60 * 60);
                  if (signed?.signedUrl) imageUrl = signed.signedUrl;
                }
                if (imageUrl) {
                  const { describePanelScreen } = await import("@/lib/ai.server");
                  extracted = await describePanelScreen({ imageUrl, name, description });
                  if (shot.path && extracted) {
                    await supabaseAdmin.from("panel_guide").insert({
                      user_id: userId,
                      name,
                      description,
                      image_url: imageUrl,
                      storage_path: shot.path,
                      source_slot: slot,
                      extracted_content: extracted,
                    } as never);
                  }
                }
              } catch (e) {
                console.error("panel guide config screenshot analysis failed", e);
              }
            }
            panelScreens.push({ name, description, extracted_content: extracted });
          }
        };
        await appendConfigScreens("mobile", (agent as { panel_screenshots_mobile?: unknown }).panel_screenshots_mobile);
        await appendConfigScreens("desktop", (agent as { panel_screenshots_desktop?: unknown }).panel_screenshots_desktop);

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

        // Catálogo SMM fixo (cache no Supabase). Sem chamada externa por mensagem.
        // Toggles do agente controlam se é incluído no prompt e se é filtrado por assunto.
        let servicesContext: string | null = null;
        const servicesFetchFailed = false;
        const a0 = agent as { catalog_in_prompt?: boolean; catalog_only_relevant?: boolean };
        const catalogInPrompt = a0.catalog_in_prompt !== false; // default true
        const onlyRelevant = a0.catalog_only_relevant !== false; // default true
        if (catalogInPrompt) {
          try {
            const { data: cacheRows } = await supabaseAdmin
              .from("catalog_cache")
              .select("service_id, nome, categoria, preco_por_1000, minimo, maximo")
              .eq("user_id", userId)
              .limit(500);
            const all = (cacheRows ?? []).map((r) => ({
              service: r.service_id as string,
              name: (r.nome as string) ?? "",
              category: (r.categoria as string) ?? "",
              rate: String(r.preco_por_1000 ?? 0),
              min: String(r.minimo ?? 0),
              max: String(r.maximo ?? 0),
            }));
            if (all.length > 0) {
              const lowerText = (text ?? "").toLowerCase();
              const platforms: Array<{ key: string; label: string; rx: RegExp }> = [
                { key: "spotify", label: "SPOTIFY", rx: /spotify|playlist|ouvintes?|saves?/i },
                { key: "instagram", label: "INSTAGRAM", rx: /instagram|insta|reels?|stories?/i },
                { key: "youtube", label: "YOUTUBE", rx: /youtube|yt\b|inscritos?|view(s|er)?|monetiza|shorts?/i },
                { key: "tiktok", label: "TIKTOK", rx: /tiktok|tt\b/i },
                { key: "kwai", label: "KWAI", rx: /kwai/i },
                { key: "facebook", label: "FACEBOOK", rx: /facebook|fb\b|\bface\b/i },
              ];
              const matched = platforms.filter((p) => p.rx.test(lowerText));
              let services = all;
              if (onlyRelevant && matched.length > 0) {
                services = all.filter((s) =>
                  matched.some((p) => new RegExp(p.key, "i").test(`${s.name} ${s.category}`)),
                );
              }
              // Hard cap para o prompt não explodir
              const baseList = services
                .slice(0, 200)
                .map((s) => `ID: ${s.service} | Nome: ${s.name} | Categoria: ${s.category} | Preço por 1000: R$${s.rate} | MÍNIMO: ${s.min} | MÁXIMO: ${s.max}`)
                .join("\n");
              servicesContext = `${baseList}\n\nREGRA: SEMPRE consulte o campo MÍNIMO do catálogo acima antes de responder qualquer quantidade. NUNCA arredonde o mínimo.`;
              try {
                const { logEvent } = await import("@/lib/agent-logger.server");
                await logEvent({ userId, phone, conversationId: conv.id, type: "smm_services", level: "info", summary: `💰 Catálogo cache: ${services.length}/${all.length}${matched.length > 0 ? ` (filtrado: ${matched.map((p) => p.label).join(",")})` : ""}`, metadata: { used: services.length, total: all.length, onlyRelevant, matched: matched.map((p) => p.key) } });
              } catch {}
            } else {
              console.warn("[catalog_cache] vazio — usuário precisa sincronizar pelo painel do agente");
            }
          } catch (e) {
            console.error("catalog_cache load failed", e);
          }
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
          // Imagem: baixa e converte para base64 para enviar ao Sonnet (visão).
          let _imageBase64: string | null = null;
          let _imageMediaType: string | null = null;
          if (isImage) {
            try {
              let imgUrl = mediaUrl;
              let imgMime: string | null = null;
              if (!imgUrl && messageId) {
                const { uazapiDownloadMedia } = await import("@/lib/uazapi.server");
                const dl = await uazapiDownloadMedia(
                  { uazapi_url: numberUazapiUrl ?? integ.uazapi_url ?? "", uazapi_token: instanceToken },
                  messageId,
                );
                if (dl.fileURL) imgUrl = dl.fileURL;
                if (dl.mimetype) imgMime = dl.mimetype;
              }
              if (imgUrl) {
                const r = await fetch(imgUrl);
                if (r.ok) {
                  const headerMime = r.headers.get("content-type")?.split(";")[0]?.trim() || imgMime || "image/jpeg";
                  const buf = Buffer.from(await r.arrayBuffer());
                  _imageBase64 = buf.toString("base64");
                  _imageMediaType = headerMime;
                }
              }
              console.log(`🖼️ Imagem recebida — base64 ${_imageBase64 ? `${_imageBase64.length} chars` : "FALHOU"} | mime=${_imageMediaType}`);
            } catch (e) {
              console.error("image download/encode failed", e);
            }
          }
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
            extraContext: (() => {
              const persisted = ((conv as { contexto_extra?: string | null }).contexto_extra ?? "").trim();
              const persistedBlock = persisted
                ? `CONTEXTO PERSISTENTE DA CONVERSA (fatos já confirmados em mensagens/imagens anteriores — NUNCA pergunte de novo o que já está aqui; ex: se já consta "cliente tem cadastro/saldo", NÃO pergunte se tem cadastro):\n${persisted}`
                : "";
              const blastBlock = isBlastReply
                ? (blastDispatchMode === "agente_livre"
                    ? `MODO DISPARO — AGENTE LIVRE (cliente respondeu à abordagem inicial):\nVocê abordou esse músico/artista pelo Instagram e ele respondeu positivamente. Agora conduza a conversa naturalmente para venda seguindo essa ordem:\n1) Entenda o nicho e objetivo dele (Spotify, YouTube, Instagram?)\n2) Apresente o serviço de forma personalizada para o nicho dele\n3) Informe o preço de forma direta\n4) Se hesitar → ofereça o teste grátis\n5) Se aceitar o teste → processa e aguarda entrega\n6) Após entrega → mostra o resultado e fecha a venda\n7) Se quiser comprar → envia o link do painel\n8) Se pedir mais detalhes → envia o vídeo explicativo\nUse as mídias cadastradas (áudio, vídeo, link) de forma estratégica — apenas quando fizer sentido na conversa, NUNCA tudo de uma vez. Improvise com base na resposta dele; nada de script pronto.`
                    : `MODO DISPARO — FLUXO VISUAL (cliente respondeu à abordagem inicial):\nEste lead está em uma campanha com fluxo visual configurado. Siga as etapas do fluxo definido para a campanha. Se não houver próxima etapa definida, conduza a conversa de forma natural rumo à venda usando as mídias cadastradas apenas quando fizer sentido.`)
                : "";
              return [persistedBlock, blastBlock, orderStatusContext ?? ""].filter(Boolean).join("\n\n") || null;
            })(),
            inputKind: dbKind,
            imageBase64: _imageBase64,
            imageMediaType: _imageMediaType,
          };
          try {
            const _modulesCount = Array.isArray((agent as { modules_enabled?: unknown[] }).modules_enabled) ? ((agent as { modules_enabled: unknown[] }).modules_enabled).length : 0;
            console.log('Prompt context:', { modules: _modulesCount, services: freeTestServices?.length ?? 0, examples: knowledgeExamples?.length ?? 0, historyLen: aiHistory?.length ?? 0, extraContext: orderStatusContext?.slice(0, 200) ?? '' });
          } catch {}
          const _claudeStart = Date.now();
          reply = await generateAgentReply(_claudeArgs);
          const _claudeMs = Date.now() - _claudeStart;
          console.log('Resposta do Claude:', reply);
          // Após análise de imagem pelo Sonnet, persiste fatos duráveis em
          // conversations.contexto_extra para que o agente nunca esqueça o
          // que viu no print (ex.: "cliente já tem cadastro com saldo").
          if (isImage && reply && reply.trim()) {
            try {
              const { extractDurableContextFromImageReply } = await import("@/lib/ai.server");
              const facts = await extractDurableContextFromImageReply({
                imageReply: reply,
                clientMessage: text ?? inboundBody ?? null,
              });
              if (facts) {
                const prev = ((conv as { contexto_extra?: string | null }).contexto_extra ?? "").trim();
                const existingLines = new Set(
                  prev.split("\n").map((l) => l.trim().toLowerCase()).filter(Boolean),
                );
                const newLines = facts
                  .split("\n")
                  .map((l) => l.trim())
                  .filter((l) => l && !existingLines.has(l.toLowerCase()));
                if (newLines.length > 0) {
                  const merged = [prev, ...newLines].filter(Boolean).join("\n").slice(-2000);
                  await supabaseAdmin
                    .from("conversations")
                    .update({ contexto_extra: merged } as never)
                    .eq("id", conv.id);
                }
              }
            } catch (e) {
              console.error("[contexto_extra] extraction failed", e);
            }
          }
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
              catalogInPrompt,
              catalogOnlyRelevant: onlyRelevant,
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
        const replyParts = collapseRedundantWaitingParts(reply
          .split(/===SPLIT===/i)
          .map((s) => s.trim())
          .filter((s) => s.length > 0), inboundBody);

        const replyForPreview = replyParts.join("\n");

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
        // Cap absoluto: processamos o webhook de forma síncrona neste runtime
        // (sem waitUntil), então qualquer sleep grande estoura o tempo de
        // execução do Worker antes do envio — o Claude responde mas a
        // mensagem nunca chega a sair. Mantemos caps baixos.
        const HARD_CAP_SEC = respondWithAudio ? 5 : 8;
        const baseMin = Math.max(0, Math.min(a.response_delay_min_sec ?? 2, HARD_CAP_SEC));
        const baseMax = Math.max(baseMin, Math.min(a.response_delay_max_sec ?? 5, HARD_CAP_SEC));
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

        if (!(await isAutoReplyAllowed())) {
          await supabaseAdmin.from("conversations").update({ status: "aguardando" }).eq("id", conv.id);
          try {
            const { logEvent } = await import("@/lib/agent-logger.server");
            await logEvent({
              userId,
              phone,
              conversationId: conv.id,
              type: "agent_disabled",
              level: "info",
              summary: "Resposta cancelada antes do envio porque o agente foi desativado",
            });
          } catch {}
          return new Response("ok (agent disabled before send)");
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
            // Detecta se o cliente pediu o link FALADO no áudio
            // (ex.: está dirigindo, não consegue ver, peça por áudio).
            const askedLinkBySpeech = /\b(fala(r)?\s+(por\s+)?(a|á)udio|me\s+fala|dirig(indo|ir)|estou\s+no\s+(carro|volante)|n[ãa]o\s+(consigo|posso)\s+(ver|ler|olhar|clicar)|sem\s+(ver|ler)|de\s+ouvido|ouvindo\s+apenas)\b/i.test(
              inboundBody ?? "",
            );
            // Converte um link para forma falável (pt-BR) para o ElevenLabs.
            const speakLink = (link: string): string => {
              let s = link.trim().replace(/[.,;:!?)]+$/, "");
              s = s.replace(/^https?:\/\//i, "");
              s = s.replace(/^www\./i, "dáblio dáblio dáblio ponto ");
              // Domínios conhecidos
              s = s.replace(/mindsmmpanel\.com/gi, "mind s m m panel ponto com");
              s = s.replace(/soundon\.global/gi, "sound on ponto global");
              s = s.replace(/artists\.spotify\.com/gi, "artists ponto spotify ponto com");
              // TLDs genéricos
              s = s.replace(/\.com\b/gi, " ponto com");
              s = s.replace(/\.com\.br\b/gi, " ponto com ponto bê érre");
              s = s.replace(/\.br\b/gi, " ponto bê érre");
              s = s.replace(/\.global\b/gi, " ponto global");
              s = s.replace(/\.net\b/gi, " ponto net");
              s = s.replace(/\.io\b/gi, " ponto i o");
              s = s.replace(/\.app\b/gi, " ponto app");
              s = s.replace(/\//g, " barra ");
              s = s.replace(/-/g, " traço ");
              s = s.replace(/_/g, " underline ");
              return s.replace(/\s{2,}/g, " ").trim();
            };
            // Sanitiza o texto para o TTS: troca R$ por palavras.
            // Por padrão remove TODOS os links; se o cliente pediu por áudio,
            // substitui cada link pela forma falável antes de remover.
            let baseForTts = replyParts[0];
            if (askedLinkBySpeech && extractedUrls.length > 0) {
              for (const url of extractedUrls) {
                const spoken = speakLink(url);
                baseForTts = baseForTts.split(url).join(spoken);
              }
            }
            const ttsText = baseForTts
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
              // Links — remove o que ainda restar de URLs cruas.
              .replace(/https?:\/\/\S+/gi, "")
              .replace(/www\.(?![a-zà-ú])\S+/gi, "")
              .replace(askedLinkBySpeech ? /(?!)/g : /\S+\.com\S*/gi, "")
              .replace(askedLinkBySpeech ? /(?!)/g : /\S+\.global\S*/gi, "")
              .replace(askedLinkBySpeech ? /(?!)/g : urlRegex, "")
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
            // Envia links extraídos como mensagens de texto separadas após o áudio
            // (a menos que o cliente tenha pedido o link FALADO).
            for (const url of askedLinkBySpeech ? [] : extractedUrls) {
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
              try {
                const { logEvent } = await import("@/lib/agent-logger.server");
                await logEvent({ userId, phone, conversationId: conv.id, type: "send_text", level: "info", summary: `✉️ Enviando texto (${replyParts[i].length} chars, parte ${i + 1}/${replyParts.length})`, response: replyParts[i].slice(0, 200) });
              } catch {}
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
          // === Mídias do agente (vídeos/artes) ===
          try {
            const { pickTriggeredMedia, detectPlatform } = await import("@/lib/agent-medias.server");
            const { uazapiSendMedia } = await import("@/lib/uazapi.server");
            const plataformaHint = detectPlatform(inboundBody);
            const lastMediaRaw = (conv as unknown as { last_media_sent?: { ids?: string[]; at?: string } | null }).last_media_sent;
            const recentIds = new Set<string>((lastMediaRaw?.ids ?? []).slice(-20));
            const isFreshDay = !lastMediaRaw?.at || (Date.now() - new Date(lastMediaRaw.at).getTime()) > 24 * 3600_000;
            const sentIds: string[] = [];
            const video = await pickTriggeredMedia({ ownerId: userId, text: inboundBody, plataformaHint, tipo: "video" });
            if (video && (!recentIds.has(video.id) || isFreshDay)) {
              await uazapiSendMedia(sendCreds, phone, "video", video.url, "Deixa eu te mandar um vídeo rápido explicando como funciona! 😊").catch((e) => console.error("send video failed", e));
              sentIds.push(video.id);
            }
            const arte = await pickTriggeredMedia({ ownerId: userId, text: inboundBody, plataformaHint, tipo: "imagem" });
            if (arte && (!recentIds.has(arte.id) || isFreshDay)) {
              await uazapiSendMedia(sendCreds, phone, "image", arte.url, "Aproveita! Hoje tem uma condição especial 🎉").catch((e) => console.error("send arte failed", e));
              sentIds.push(arte.id);
            }
            if (sentIds.length > 0) {
              await supabaseAdmin.from("conversations").update({
                last_media_sent: { ids: [...(lastMediaRaw?.ids ?? []), ...sentIds].slice(-20), at: new Date().toISOString() },
              }).eq("id", conv.id);
            }
          } catch (mediaErr) {
            console.error("agent_medias hook failed", mediaErr);
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
              last_message_preview: replyForPreview.slice(0, 120),
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
