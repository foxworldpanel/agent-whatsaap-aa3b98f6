// Server-only helpers for Uazapi (https://uazapi.dev).
// Each instance has its own token used as the `token` header.

export type UazapiCreds = {
  uazapi_url: string;
  uazapi_token: string;
};

function normalizePhone(raw: string): string {
  return raw.replace(/\D+/g, "");
}

function assertIndividualPhone(phone: string, path: string): void {
  // JID de grupo do WhatsApp costuma ter 18+ dígitos (ex: 120363...).
  // E.164 individual: 8–15 dígitos.
  if (!phone || phone.length < 8 || phone.length > 15) {
    throw new Error(
      `Uazapi ${path}: destino inválido "${phone}" (${phone.length} dígitos). ` +
      `Provavelmente é um JID de grupo/broadcast, não um número individual.`,
    );
  }
}

async function uazapiPost(creds: UazapiCreds, path: string, body: unknown): Promise<Record<string, unknown> | null> {
  const base = creds.uazapi_url.replace(/\/+$/, "");
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      token: creds.uazapi_token,
    },
    body: JSON.stringify(body),
  });
  const rawText = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Uazapi ${path} falhou (${res.status}): ${rawText.slice(0, 300)}`);
  }
  try {
    return rawText ? (JSON.parse(rawText) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function uazapiPostRaw(
  creds: UazapiCreds,
  path: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; text: string }> {
  const base = creds.uazapi_url.replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: creds.uazapi_token },
      body: JSON.stringify(body),
    });
    const text = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, text: text.slice(0, 200) };
  } catch (err) {
    return { ok: false, status: 0, text: String(err).slice(0, 200) };
  }
}

// Cache do endpoint que funcionou para evitar re-tentar nas próximas chamadas.
let presenceEndpointCache: { path: string; build: (phone: string, presence: string, delay?: number) => Record<string, unknown> } | null = null;

const PRESENCE_VARIANTS: Array<{
  path: string;
  build: (phone: string, presence: string, delay?: number) => Record<string, unknown>;
}> = [
  { path: "/chat/presence", build: (phone, presence, delay) => ({ phone, presence, ...(delay ? { delay } : {}) }) },
  { path: "/message/presence", build: (phone, presence, delay) => ({ number: phone, presence, ...(delay ? { delay } : {}) }) },
  { path: "/chat/sendPresence", build: (phone, presence, delay) => ({ phone, status: presence, ...(delay ? { delay } : {}) }) },
];

export async function uazapiSendText(
  creds: UazapiCreds,
  to: string,
  text: string,
): Promise<{ messageId: string | null; status: string | null; raw: Record<string, unknown> | null }> {
  const phone = normalizePhone(to);
  assertIndividualPhone(phone, "/send/text");
  const resp = await uazapiPost(creds, "/send/text", { number: phone, text });
  const nestedData = resp?.data as Record<string, unknown> | undefined;
  const nestedKey = (resp?.key as Record<string, unknown> | undefined) ?? (nestedData?.key as Record<string, unknown> | undefined);
  const messageId =
    (resp?.messageId as string | undefined) ??
    (resp?.id as string | undefined) ??
    (resp?.messageid as string | undefined) ??
    (resp?.message_id as string | undefined) ??
    (nestedData?.messageId as string | undefined) ??
    (nestedData?.id as string | undefined) ??
    (nestedData?.messageid as string | undefined) ??
    (nestedKey?.id as string | undefined) ??
    ((resp?.message as Record<string, unknown> | undefined)?.id as string | undefined) ??
    ((nestedData?.message as Record<string, unknown> | undefined)?.id as string | undefined) ??
    null;
  const status =
    (resp?.status as string | undefined) ??
    (nestedData?.status as string | undefined) ??
    ((resp?.message as Record<string, unknown> | undefined)?.status as string | undefined) ??
    null;
  // Log RESPOSTA COMPLETA para diagnosticar "HTTP 200 sem entrega real".
  // A Uazapi às vezes responde 200 sem enfileirar (JID de grupo, número inválido,
  // instância dessincronizada). Sem o JSON cru fica impossível diferenciar.
  console.log("[uazapi/send-text]", {
    to: phone,
    messageId,
    status,
    raw: resp,
  });
  if (!messageId) {
    const rawJson = JSON.stringify(resp ?? {}).slice(0, 1500);
    console.warn("[uazapi/send-text] ⚠️ resposta 200 SEM messageId — provável não-entrega", {
      to: phone,
      raw: resp,
    });
    throw new Error(`Uazapi /send/text respondeu 200 sem messageId para ${phone}. Raw: ${rawJson}`);
  }
  return { messageId, status, raw: resp };
}

// Presence helpers — use Uazapi /chat/presence (the endpoint available on
// mindsmmglobal.uazapi.com). Failures are swallowed (best-effort).
async function uazapiSendPresence(
  creds: UazapiCreds,
  to: string,
  presence: "composing" | "recording" | "paused" | "available",
  durationMs?: number,
): Promise<void> {
  const phone = normalizePhone(to);
  const delay =
    durationMs && presence !== "paused" && presence !== "available"
      ? Math.max(1000, Math.min(durationMs, 60_000))
      : undefined;

  if (presenceEndpointCache) {
    const body = presenceEndpointCache.build(phone, presence, delay);
    const r = await uazapiPostRaw(creds, presenceEndpointCache.path, body);
    if (r.ok) return;
    console.warn("[uazapi-presence] endpoint cacheado falhou, refazendo descoberta", {
      path: presenceEndpointCache.path,
      status: r.status,
      text: r.text,
    });
    presenceEndpointCache = null;
  }

  for (const variant of PRESENCE_VARIANTS) {
    const body = variant.build(phone, presence, delay);
    const r = await uazapiPostRaw(creds, variant.path, body);
    console.info("[uazapi-presence] tentativa", {
      path: variant.path,
      body,
      status: r.status,
      ok: r.ok,
      text: r.text,
    });
    if (r.ok) {
      presenceEndpointCache = variant;
      return;
    }
  }
  console.warn("[uazapi-presence] nenhuma variação retornou 200", { presence, phone });
}

export async function uazapiSendTyping(
  creds: UazapiCreds,
  to: string,
  durationMs: number,
): Promise<void> {
  await uazapiSendPresence(creds, to, "composing", durationMs);
}

export async function uazapiSendRecording(
  creds: UazapiCreds,
  to: string,
  durationMs: number,
): Promise<void> {
  await uazapiSendPresence(creds, to, "recording", durationMs);
}

export async function uazapiClearPresence(
  creds: UazapiCreds,
  to: string,
): Promise<void> {
  await uazapiSendPresence(creds, to, "paused");
}

export async function uazapiSendAudio(
  creds: UazapiCreds,
  to: string,
  audioUrlOrBase64: string,
): Promise<void> {
  const phone = normalizePhone(to);
  assertIndividualPhone(phone, "/send/media");

  // Para respostas do agente queremos nota de voz (PTT), não um MP3 como anexo.
  // UAZAPI 2.x aceita URL pública ou data URI base64 em `file`.
  const payload = {
    number: phone,
    type: "ptt",
    file: audioUrlOrBase64,
    mimetype: "audio/mpeg",
  };

  try {
    const resp = await uazapiPost(creds, "/send/media", payload);
    console.log("[uazapi/send-audio] PTT enviado", {
      to: phone,
      raw: resp,
    });
    return;
  } catch (pttError) {
    // Compatibilidade defensiva com instâncias antigas que não aceitem `ptt`.
    console.warn("[uazapi/send-audio] PTT falhou; tentando type=audio:", pttError);
    const resp = await uazapiPost(creds, "/send/media", {
      number: phone,
      type: "audio",
      file: audioUrlOrBase64,
      mimetype: "audio/mpeg",
    });
    console.log("[uazapi/send-audio] áudio fallback enviado", {
      to: phone,
      raw: resp,
    });
  }
}

export async function uazapiSendMedia(
  creds: UazapiCreds,
  to: string,
  type: "video" | "image" | "document" | "audio",
  fileUrlOrBase64: string,
  caption?: string,
): Promise<void> {
  await uazapiPost(creds, "/send/media", {
    number: normalizePhone(to),
    type,
    file: fileUrlOrBase64,
    ...(caption ? { text: caption } : {}),
  });
}

export async function uazapiDownloadMedia(
  creds: UazapiCreds,
  messageId: string,
  openaiApiKey?: string,
): Promise<{
  fileURL: string | null;
  fileData: string | null;
  mimetype: string | null;
  transcription: string | null;
}> {
  const base = creds.uazapi_url.replace(/\/+$/, "");

  const openaiKey = openaiApiKey?.trim() || "";
  const transcribe = Boolean(openaiKey);

  // Uazapi v2 suporta transcrição do áudio no próprio /message/download
  // via Whisper quando enviamos transcribe=true + openai_apikey.
  const bodies = [
    {
      id: messageId,
      transcribe,
      ...(openaiKey ? { openai_apikey: openaiKey } : {}),
    },
  ];

  let lastStatus = 0;
  let lastText = "";
  let payload: Record<string, unknown> | null = null;

  for (const body of bodies) {
    const res = await fetch(`${base}/message/download`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        token: creds.uazapi_token,
      },
      body: JSON.stringify(body),
    });

    lastStatus = res.status;
    lastText = await res.text().catch(() => "");

    if (!res.ok) continue;

    try {
      payload = lastText ? JSON.parse(lastText) as Record<string, unknown> : {};
    } catch {
      payload = {};
    }
    break;
  }

  if (!payload) {
    throw new Error(
      `Uazapi /message/download falhou (${lastStatus}): ${lastText.slice(0, 300)}`,
    );
  }

  const findStringByKeys = (
    value: unknown,
    wantedKeys: string[],
    depth = 0,
  ): string | null => {
    if (depth > 6 || value == null) return null;

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findStringByKeys(item, wantedKeys, depth + 1);
        if (found) return found;
      }
      return null;
    }

    if (typeof value !== "object") return null;

    const obj = value as Record<string, unknown>;

    for (const key of wantedKeys) {
      const candidate = obj[key];
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
      if (candidate && typeof candidate === "object") {
        const nestedCandidate = findStringByKeys(candidate, wantedKeys, depth + 1);
        if (nestedCandidate) return nestedCandidate;
      }
    }

    // Descemos nos objetos apenas para procurar AS MESMAS CHAVES.
    // Nunca tratamos uma string arbitrária (id, status, type...) como transcrição.
    for (const nested of Object.values(obj)) {
      if (nested && typeof nested === "object") {
        const found = findStringByKeys(nested, wantedKeys, depth + 1);
        if (found) return found;
      }
    }

    return null;
  };

  const urlCandidate = findStringByKeys(payload, [
    "fileURL", "fileUrl", "mediaUrl", "mediaURL", "downloadUrl", "downloadURL", "url",
  ]);

  const base64Candidate = findStringByKeys(payload, [
    "base64", "fileBase64", "mediaBase64", "fileData", "data", "file",
  ]);

  const mimetype = findStringByKeys(payload, [
    "mimetype", "mimeType", "mime", "contentType",
  ]);

  const transcription = findStringByKeys(payload, [
    "transcription", "transcript", "text",
  ]);

  const fileURL =
    urlCandidate && /^https?:\/\//i.test(urlCandidate)
      ? urlCandidate
      : null;

  let fileData: string | null = null;
  if (base64Candidate) {
    if (/^data:audio\//i.test(base64Candidate)) {
      fileData = base64Candidate;
    } else if (
      base64Candidate.length > 500 &&
      /^[A-Za-z0-9+/=\r\n]+$/.test(base64Candidate)
    ) {
      fileData = `data:${mimetype || "audio/ogg"};base64,${base64Candidate.replace(/\s+/g, "")}`;
    }
  }

  console.log("[uazapi/message-download]", {
    messageId,
    hasFileURL: !!fileURL,
    hasFileData: !!fileData,
    mimetype,
    hasTranscription: !!transcription,
    responseKeys: Object.keys(payload).slice(0, 20),
  });

  return {
    fileURL,
    fileData,
    mimetype,
    transcription,
  };
}

export async function uazapiGetProfilePic(
  creds: UazapiCreds,
  phone: string,
): Promise<string | null> {
  try {
    const base = creds.uazapi_url.replace(/\/+$/, "");
    const res = await fetch(`${base}/chat/GetNameAndImageURL`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        token: creds.uazapi_token,
      },
      body: JSON.stringify({ number: normalizePhone(phone), preview: false }),
    });
    if (!res.ok) return null;
    const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!j) return null;
    const url =
      (j.image as string | undefined) ??
      (j.imageUrl as string | undefined) ??
      (j.profilePictureUrl as string | undefined) ??
      (j.url as string | undefined);
    return typeof url === "string" && url.startsWith("http") ? url : null;
  } catch {
    return null;
  }
}

// ---- Instance management ----

export async function uazapiCreateInstance(opts: {
  uazapi_url: string;
  uazapi_admin_token: string;
  name: string;
}): Promise<{ token: string }> {
  const base = opts.uazapi_url.replace(/\/+$/, "");
  const res = await fetch(`${base}/instance/init`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      admintoken: opts.uazapi_admin_token,
    },
    body: JSON.stringify({ name: opts.name, systemName: "ZapAgent" }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(
      `Uazapi /instance/init falhou (${res.status}): ${t.slice(0, 300)}. ` +
      `Verifique se o Admin Token informado é válido para ${base}.`,
    );
  }
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const inst = (j.instance as Record<string, unknown> | undefined) ?? j;
  const token = (inst.token as string | undefined) ?? (j.token as string | undefined);
  if (!token) throw new Error("Uazapi não retornou token da instância");
  return { token };
}

export async function uazapiConnect(creds: UazapiCreds): Promise<{ qrcode: string | null; status: string | null }> {
  const base = creds.uazapi_url.replace(/\/+$/, "");
  const res = await fetch(`${base}/instance/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token: creds.uazapi_token },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Uazapi /instance/connect falhou (${res.status}): ${t.slice(0, 300)}`);
  }
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const inst = (j.instance as Record<string, unknown> | undefined) ?? j;
  const qrcode =
    (inst.qrcode as string | undefined) ??
    (j.qrcode as string | undefined) ??
    (j.qr as string | undefined) ??
    null;
  const status = (inst.status as string | undefined) ?? (j.status as string | undefined) ?? null;
  return { qrcode, status };
}

export async function uazapiStatus(creds: UazapiCreds): Promise<{ status: string | null }> {
  const base = creds.uazapi_url.replace(/\/+$/, "");
  const res = await fetch(`${base}/instance/status`, {
    method: "GET",
    headers: { token: creds.uazapi_token },
  });
  if (!res.ok) return { status: null };
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const inst = (j.instance as Record<string, unknown> | undefined) ?? j;
  const status = (inst.status as string | undefined) ?? (j.status as string | undefined) ?? null;
  return { status };
}

export async function uazapiDisconnect(creds: UazapiCreds): Promise<void> {
  const base = creds.uazapi_url.replace(/\/+$/, "");
  await fetch(`${base}/instance/disconnect`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token: creds.uazapi_token },
    body: JSON.stringify({}),
  }).catch(() => {});
}

// ---- Chat extraction ----

export type UazapiChatSummary = {
  phone: string;
  name: string | null;
  last_message: string | null;
  last_message_at: string | null; // ISO
  message_count: number | null;
  image_url: string | null;
};

export async function uazapiListChats(creds: UazapiCreds): Promise<UazapiChatSummary[]> {
  const base = creds.uazapi_url.replace(/\/+$/, "");
  // Uazapi /chat/find returns all chats when body is empty filter
  const res = await fetch(`${base}/chat/find`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token: creds.uazapi_token },
    body: JSON.stringify({ operator: "AND", sort: "-wa_lastMsgTimestamp" }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Uazapi /chat/find falhou (${res.status}): ${t.slice(0, 300)}`);
  }
  const j = (await res.json().catch(() => null)) as unknown;
  const raw: unknown[] = Array.isArray(j)
    ? j
    : Array.isArray((j as { chats?: unknown[] })?.chats)
      ? ((j as { chats: unknown[] }).chats)
      : Array.isArray((j as { data?: unknown[] })?.data)
        ? ((j as { data: unknown[] }).data)
        : [];

  const out: UazapiChatSummary[] = [];
  for (const item of raw) {
    const r = item as Record<string, unknown>;
    const id = (r.wa_chatid as string | undefined) ?? (r.id as string | undefined) ?? (r.chatid as string | undefined) ?? "";
    if (!id || id.includes("@g.us") || id.includes("broadcast") || id.includes("status")) continue;
    const phone = normalizePhone(id.split("@")[0] ?? "");
    if (!phone || phone.length < 8) continue;
    const ts =
      (r.wa_lastMsgTimestamp as number | undefined) ??
      (r.lastMessageTimestamp as number | undefined) ??
      (r.t as number | undefined);
    out.push({
      phone,
      name:
        (r.wa_name as string | undefined) ??
        (r.lead_name as string | undefined) ??
        (r.name as string | undefined) ??
        (r.pushname as string | undefined) ??
        null,
      last_message:
        (r.wa_lastMessageText as string | undefined) ??
        (r.lastMessage as string | undefined) ??
        (r.lastMessageText as string | undefined) ??
        null,
      last_message_at: ts ? new Date(ts > 1e12 ? ts : ts * 1000).toISOString() : null,
      message_count:
        (r.wa_messagesCount as number | undefined) ??
        (r.messagesCount as number | undefined) ??
        (r.totalMessages as number | undefined) ??
        null,
      image_url:
        (r.image as string | undefined) ??
        (r.imagePreview as string | undefined) ??
        (r.profilePictureUrl as string | undefined) ??
        null,
    });
  }
  return out;
}

export type UazapiMessageRow = {
  external_id: string;
  chat_phone: string;
  from_me: boolean;
  text: string | null;
  type: string | null;
  timestamp: string; // ISO
};

export async function uazapiListMessages(
  creds: UazapiCreds,
  chatPhone: string,
  limit = 30,
): Promise<UazapiMessageRow[]> {
  const base = creds.uazapi_url.replace(/\/+$/, "");
  const phone = normalizePhone(chatPhone);
  const res = await fetch(`${base}/message/find`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token: creds.uazapi_token },
    body: JSON.stringify({
      operator: "AND",
      sort: "-messageTimestamp",
      limit,
      wa_chatid: `${phone}@s.whatsapp.net`,
    }),
  });
  if (!res.ok) return [];
  const j = (await res.json().catch(() => null)) as unknown;
  const raw: unknown[] = Array.isArray(j)
    ? j
    : Array.isArray((j as { messages?: unknown[] })?.messages)
      ? ((j as { messages: unknown[] }).messages)
      : Array.isArray((j as { data?: unknown[] })?.data)
        ? ((j as { data: unknown[] }).data)
        : [];
  const out: UazapiMessageRow[] = [];
  for (const item of raw) {
    const r = item as Record<string, unknown>;
    const id =
      (r.messageid as string | undefined) ??
      (r.id as string | undefined) ??
      (r.key_id as string | undefined) ??
      (r.wa_messageid as string | undefined);
    if (!id) continue;
    const ts =
      (r.messageTimestamp as number | undefined) ??
      (r.timestamp as number | undefined) ??
      (r.t as number | undefined);
    const chatid =
      (r.wa_chatid as string | undefined) ??
      (r.chatid as string | undefined) ??
      `${phone}@s.whatsapp.net`;
    const fromMe =
      (r.fromMe as boolean | undefined) ??
      (r.fromme as boolean | undefined) ??
      (r.from_me as boolean | undefined) ??
      false;
    const text =
      (r.text as string | undefined) ??
      (r.body as string | undefined) ??
      (r.content as string | undefined) ??
      (r.message as string | undefined) ??
      null;
    const type =
      (r.messageType as string | undefined) ??
      (r.type as string | undefined) ??
      null;
    out.push({
      external_id: id,
      chat_phone: normalizePhone(chatid.split("@")[0] ?? phone),
      from_me: !!fromMe,
      text: text ? String(text) : null,
      type,
      timestamp: ts ? new Date(ts > 1e12 ? ts : ts * 1000).toISOString() : new Date().toISOString(),
    });
  }
  return out;
}