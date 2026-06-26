// Server-only client for MIND SMM Panel (https://mindsmmpanel.com).

export type SmmCreds = {
  url: string;
  key: string;
};

async function smmPost(creds: SmmCreds, payload: Record<string, unknown>): Promise<unknown> {
  // MIND SMM Panel: POST JSON conforme docs oficiais
  // (https://mindsmmpanel.com/smmpanel/api). Endpoint correto: /smmpanel/api/v1.
  const body = JSON.stringify({ key: creds.key, ...payload });
  const res = await fetch(creds.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; LovableAgent/1.0)",
    },
    body,
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
): Promise<{ status?: string; error?: string; raw: unknown }> {
  // MIND SMM Panel rejeita POST JSON para `status` ("API is Disable for this user...").
  // O endpoint correto é GET com query params em /api/v1.
  const sep = creds.url.includes("?") ? "&" : "?";
  const getUrl = `${creds.url}${sep}action=status&order=${encodeURIComponent(String(orderId))}&key=${encodeURIComponent(creds.key)}`;
  let raw: Record<string, unknown> = {};
  try {
    const res = await fetch(getUrl, { method: "GET" });
    const text = await res.text();
    console.log("[smmOrderStatus] GET order=", orderId, "status=", res.status, "body=", text.slice(0, 300));
    try { raw = JSON.parse(text) as Record<string, unknown>; } catch {
      raw = { error: `Resposta não-JSON (${res.status}): ${text.slice(0, 200)}` };
    }
  } catch (e) {
    raw = { error: e instanceof Error ? e.message : String(e) };
  }
  const status = (raw.status as string | undefined)?.toLowerCase();
  return { status, error: raw.error as string | undefined, raw };
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
  // Try GET first (most SMM panels accept it for action=services), fall back to POST.
  let raw: unknown = null;
  let lastErr = "";
  try {
    const getUrl = `${creds.url}${creds.url.includes("?") ? "&" : "?"}action=services&key=${encodeURIComponent(creds.key)}`;
    const res = await fetch(getUrl, { method: "GET" });
    const text = await res.text();
    console.log("[smmFetchServices] GET status:", res.status, "body:", text.slice(0, 300));
    if (res.ok) {
      try { raw = JSON.parse(text); } catch { lastErr = `Resposta não-JSON (GET ${res.status}): ${text.slice(0, 200)}`; }
    } else {
      lastErr = `GET ${res.status}: ${text.slice(0, 200)}`;
    }
  } catch (e) {
    lastErr = `Falha de rede (GET): ${e instanceof Error ? e.message : String(e)}`;
    console.log("[smmFetchServices] GET threw:", lastErr);
  }
  if (!Array.isArray(raw)) {
    try {
      raw = await smmPost(creds, { action: "services" });
      console.log("[smmFetchServices] POST ok, items:", Array.isArray(raw) ? (raw as unknown[]).length : "not-array");
    } catch (e) {
      const postErr = e instanceof Error ? e.message : String(e);
      console.log("[smmFetchServices] POST failed:", postErr);
      throw new Error(lastErr || postErr);
    }
  }
  if (!Array.isArray(raw)) {
    // Panel returned an object — usually { error: "..." }
    const obj = raw as Record<string, unknown> | null;
    const apiErr = obj && typeof obj.error === "string" ? obj.error : null;
    throw new Error(apiErr ? `API retornou erro: ${apiErr}` : (lastErr || "Resposta inesperada do painel SMM"));
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