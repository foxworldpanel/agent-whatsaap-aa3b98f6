import { timingSafeEqual } from "node:crypto";

// Shared apikey/bearer check for public cron endpoints. pg_cron passes the
// project's anon/publishable key in the `apikey` header (see
// schedule-jobs-options knowledge). Without this gate, anyone on the internet
// could POST to the dispatcher URLs and force mass WhatsApp sends.
export function assertCronAuthorized(request: Request): Response | null {
  const expected =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    "";
  if (!expected) {
    return new Response("cron auth not configured", { status: 500 });
  }
  const provided =
    request.headers.get("apikey") ||
    (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!provided) return new Response("unauthorized", { status: 401 });

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return new Response("unauthorized", { status: 401 });
  }
  return null;
}