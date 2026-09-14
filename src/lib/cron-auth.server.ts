import { timingSafeEqual } from "node:crypto";

// Public cron endpoints must use a private scheduler secret. Supabase
// publishable/anon keys identify a project/client but are intentionally public
// credentials, so accepting one here would let any holder trigger privileged
// dispatcher/recovery work through the service-role backend.
export function assertCronAuthorized(request: Request): Response | null {
  const expected = process.env.AGENT_CRON_SECRET || process.env.CRON_SECRET || "";
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
