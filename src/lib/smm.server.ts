// Server-only client for MIND SMM Panel (https://mindsmmpanel.com).

export type SmmCreds = {
  url: string;
  key: string;
};

async function smmPost(creds: SmmCreds, payload: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(creds.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: creds.key, ...payload }),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`SMM resposta inválida (${res.status}): ${text.slice(0, 300)}`);
  }
  if (!res.ok) {
    throw new Error(`SMM falhou (${res.status}): ${text.slice(0, 300)}`);
  }
  return json;
}

export async function smmAddOrder(
  creds: SmmCreds,
  params: { service: string; link: string; quantity: number },
): Promise<{ order?: string | number; error?: string; raw: unknown }> {
  const raw = (await smmPost(creds, {
    action: "add",
    service: params.service,
    link: params.link,
    quantity: params.quantity,
  })) as Record<string, unknown>;
  return {
    order: raw.order as string | number | undefined,
    error: raw.error as string | undefined,
    raw,
  };
}

export async function smmOrderStatus(
  creds: SmmCreds,
  orderId: string | number,
): Promise<{ status?: string; error?: string; raw: unknown }> {
  const raw = (await smmPost(creds, { action: "status", order: orderId })) as Record<
    string,
    unknown
  >;
  const status = (raw.status as string | undefined)?.toLowerCase();
  return { status, error: raw.error as string | undefined, raw };
}

// Detects first Instagram or YouTube URL in a message.
const URL_RE = /(https?:\/\/[^\s]+)/i;
const IG_RE = /(instagram\.com|instagr\.am)\//i;
const YT_RE = /(youtube\.com|youtu\.be)\//i;

export function detectSocialLink(text: string): { url: string; platform: "instagram" | "youtube" } | null {
  if (!text) return null;
  // try multiple URLs in the text
  const matches = text.match(/https?:\/\/[^\s]+/gi) ?? [];
  for (const u of matches) {
    if (IG_RE.test(u)) return { url: u, platform: "instagram" };
    if (YT_RE.test(u)) return { url: u, platform: "youtube" };
  }
  const single = URL_RE.exec(text);
  if (single) {
    const u = single[1];
    if (IG_RE.test(u)) return { url: u, platform: "instagram" };
    if (YT_RE.test(u)) return { url: u, platform: "youtube" };
  }
  return null;
}