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