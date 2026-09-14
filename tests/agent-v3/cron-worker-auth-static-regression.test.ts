import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const auth = source("src/lib/cron-auth.server.ts");
const scheduler = source("supabase/migrations/20260914184500_schedule_agent_customer_turn_workers.sql");

describe("Agent V3 cron worker authentication", () => {
  it("accepts only a private runtime secret", () => {
    expect(auth).toContain("process.env.AGENT_CRON_SECRET");
    expect(auth).toContain('request.headers.get("x-cron-secret")');
    expect(auth).not.toContain("SUPABASE_PUBLISHABLE_KEY");
    expect(auth).not.toContain("SUPABASE_ANON_KEY");
    expect(auth).not.toContain("VITE_SUPABASE_PUBLISHABLE_KEY");
    expect(auth).not.toContain('request.headers.get("apikey")');
  });

  it("fails closed before scheduling and uses the matching Vault secret", () => {
    expect(scheduler).toContain("Missing required Vault secret: app_base_url");
    expect(scheduler).toContain("Missing required Vault secret: agent_cron_secret");
    expect(scheduler.match(/'x-cron-secret'/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(scheduler.match(/name='agent_cron_secret'/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(scheduler).not.toContain("supabase_publishable_key");
    expect(scheduler).not.toContain("'apikey'");
    expect(scheduler.match(/body := '\{\}'::jsonb/g)?.length ?? 0).toBe(2);
  });
});
