import { timingSafeEqual } from "node:crypto";

// Public Agent V3 worker endpoints use their own private scheduler secret.
// Do not fall back to generic/shared credentials: only the dedicated header
// emitted by the Stage C scheduler is authorized to trigger service-role work.
export function assertCronAuthorized(request: Request): Response | null {
  const expected = process.env.AGENT_CRON_SECRET || "";
  if (!expected) {
    return new Response("cron auth not configured", { status: 500 });
  }

  const provided = request.headers.get("x-cron-secret") || "";
  if (!provided) return new Response("unauthorized", { status: 401 });

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return new Response("unauthorized", { status: 401 });
  }
  return null;
}
