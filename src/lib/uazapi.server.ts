// Server-only helpers for Uazapi (https://uazapi.dev).
// Each instance has its own token used as the `token` header.

export type UazapiCreds = {
  uazapi_url: string;
  uazapi_token: string;
};

function normalizePhone(raw: string): string {
  return raw.replace(/\D+/g, "");
}

async function uazapiPost(creds: UazapiCreds, path: string, body: unknown): Promise<void> {
  const base = creds.uazapi_url.replace(/\/+$/, "");
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      token: creds.uazapi_token,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Uazapi ${path} falhou (${res.status}): ${t.slice(0, 300)}`);
  }
}

export async function uazapiSendText(creds: UazapiCreds, to: string, text: string): Promise<void> {
  await uazapiPost(creds, "/send/text", { number: normalizePhone(to), text });
}

// Sends "typing..." (composing) presence to a chat for ~`durationMs` ms.
// Uses Uazapi /message/presence endpoint. Failures are swallowed (best-effort).
export async function uazapiSendTyping(
  creds: UazapiCreds,
  to: string,
  durationMs: number,
): Promise<void> {
  try {
    await uazapiPost(creds, "/message/presence", {
      number: normalizePhone(to),
      presence: "composing",
      delay: Math.max(1000, Math.min(durationMs, 60_000)),
    });
  } catch {
    // ignore — presence is best-effort
  }
}

export async function uazapiSendAudio(
  creds: UazapiCreds,
  to: string,
  audioUrlOrBase64: string,
): Promise<void> {
  await uazapiPost(creds, "/send/media", {
    number: normalizePhone(to),
    type: "audio",
    file: audioUrlOrBase64,
  });
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
      adminToken: opts.uazapi_admin_token,
    },
    body: JSON.stringify({ name: opts.name, systemName: "ZapAgent" }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Uazapi /instance/init falhou (${res.status}): ${t.slice(0, 300)}`);
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