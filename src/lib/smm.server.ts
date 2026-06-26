// Server-only client for MIND SMM Panel (https://mindsmmpanel.com).

export type SmmCreds = {
  url: string;
  key: string;
};

function normalizeSmmUrl(url: string): string {
  const trimmed = (url || "https://mindsmmpanel.com/smmpanel/api/v1").trim();
  return trimmed.replace(/mindsmmpanel\.com\/smmpanel\/api\/v2\/?$/i, "mindsmmpanel.com/smmpanel/api/v1");
}

async function smmPost(creds: SmmCreds, payload: Record<string, unknown>): Promise<unknown> {
  // MIND SMM Panel: a documentação informa HTTP Method POST para add/status/services/balance.
  // Envia como application/x-www-form-urlencoded, formato aceito por painéis SMM compatíveis.
  const body = new URLSearchParams();
  body.set("key", creds.key.trim());
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null) continue;
    body.set(key, String(value));
  }

  const res = await fetch(normalizeSmmUrl(creds.url), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; LovableAgent/1.0)",
    },
    body: body.toString(),
  });
  const text = await res.text();
  console.log("[smmPost]", payload.action, "→ status", res.status, "body:", text.slice(0, 500));
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
): Promise<{ status?: string; start_count?: number; quantity?: number; error?: string; raw: unknown }> {
  const raw = (await smmPost(creds, {
    action: "status",
    order: String(orderId),
  })) as Record<string, unknown>;
  const status = (raw.status as string | undefined)?.toLowerCase();
  const start_count = raw.start_count !== undefined ? Number(raw.start_count) : undefined;
  const quantity = raw.quantity !== undefined ? Number(raw.quantity) : undefined;
  return {
    status,
    start_count: Number.isFinite(start_count) ? start_count : undefined,
    quantity: Number.isFinite(quantity) ? quantity : undefined,
    error: raw.error as string | undefined,
    raw,
  };
}

// Fetch the panel's full service catalogue (action=services).
// Returns a compact array suitable to inject as context for the LLM.
export async function smmFetchServices(creds: SmmCreds): Promise<Array<{
  service: string;
  name: string;
  category: string;
  rate: string;
  min: string;
  max: string;
}>> {
  const raw = await smmPost(creds, { action: "services" });
  console.log("[smmFetchServices] POST ok, items:", Array.isArray(raw) ? (raw as unknown[]).length : "not-array");
  if (!Array.isArray(raw)) {
    // Panel returned an object — usually { error: "..." }
    const obj = raw as Record<string, unknown> | null;
    const apiErr = obj && typeof obj.error === "string" ? obj.error : null;
    throw new Error(apiErr ? `API retornou erro: ${apiErr}` : "Resposta inesperada do painel SMM");
  }
  return (raw as unknown[]).slice(0, 500).map((s) => {
    const r = s as Record<string, unknown>;
    return {
      service: String(r.service ?? ""),
      name: String(r.name ?? ""),
      category: String(r.category ?? ""),
      rate: String(r.rate ?? ""),
      min: String(r.min ?? ""),
      max: String(r.max ?? ""),
    };
  });
}

// Detects first Instagram, YouTube, TikTok or Spotify URL in a message.
const IG_RE = /(instagram\.com|instagr\.am)\//i;
const YT_RE = /(youtube\.com|youtu\.be)\//i;
const TT_RE = /(tiktok\.com|vm\.tiktok\.com)\//i;
const SP_RE = /(open\.spotify\.com|spotify\.link)\//i;

export type SocialPlatform = "instagram" | "youtube" | "tiktok" | "spotify";

export function detectSocialLink(text: string): { url: string; platform: SocialPlatform } | null {
  if (!text) return null;
  const matches = text.match(/https?:\/\/[^\s]+/gi) ?? [];
  for (const u of matches) {
    if (IG_RE.test(u)) return { url: u, platform: "instagram" };
    if (YT_RE.test(u)) return { url: u, platform: "youtube" };
    if (TT_RE.test(u)) return { url: u, platform: "tiktok" };
    if (SP_RE.test(u)) return { url: u, platform: "spotify" };
  }
  return null;
}

// Normalize a social link for dedup purposes: lowercased host+path, no query/hash, no trailing slash.
export function normalizeSocialLink(url: string): string {
  try {
    const u = new URL(url.trim());
    const host = u.host.toLowerCase().replace(/^www\./, "");
    const path = u.pathname.replace(/\/+$/, "").toLowerCase();
    return `${host}${path}`;
  } catch {
    return url.trim().toLowerCase().split("?")[0].replace(/\/+$/, "");
  }
}