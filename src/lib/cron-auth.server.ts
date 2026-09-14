import { timingSafeEqual } from "node:crypto";

// Public Agent V3 worker endpoints use their own private scheduler secret.
// Do not fall back to a generic CRON_SECRET: sharing a credential with unrelated
// scheduled jobs unnecessarily widens the authority able to trigger service-role
// dispatcher/recovery work. Supabase publishable/anon keys are public credentials
// and are intentionally never accepted here either.
export function assertCronAuthorized(request: Request): Response | null {
  const expected = process.env.AGENT_CRON_SECRET || "";
  if (!expected) {
    return new Response("cron auth not configured", { status: 500 });
  }

  const provided =
    request.headers.get("x-cron-secret") ||
    (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!provided) return new Response("unauthorized", { status: 401 });

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return new Response("unauthorized", { status: 401 });
  }
  return null;
}
