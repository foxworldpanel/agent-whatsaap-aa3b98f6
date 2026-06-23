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