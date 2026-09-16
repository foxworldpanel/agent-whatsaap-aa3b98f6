import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const webhook = readFileSync("src/routes/api/public/hooks/uazapi-webhook.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260914393000_fallback_message_identity_no_loss.sql", "utf8");
describe("provider-id-less inbound safety",()=>{it("documents legacy collision and closes silent loss at persistence",()=>{expect(webhook).toContain("Math.floor(Date.now() / 10000)");expect(migration).toContain("NEW.external_id LIKE 'fb:%'");expect(migration).toContain("gen_random_uuid()");expect(migration).toContain("BEFORE INSERT ON public.messages");});});
