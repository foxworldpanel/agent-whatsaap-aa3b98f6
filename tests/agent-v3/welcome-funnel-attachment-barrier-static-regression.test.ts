import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const migration=readFileSync("supabase/migrations/20260914394500_welcome_funnel_attachment_barrier.sql","utf8");
describe("Welcome Funnel attachment barrier",()=>{it("keeps inbound pending while funnel side effects are active or uncertain",()=>{expect(migration).toContain("pg_advisory_xact_lock(hashtextextended(v_conversation_id::text,31))");expect(migration).toContain("s.status IN ('running','needs_review')");expect(migration).toContain("Customer Turn attachment blocked by Welcome Funnel execution barrier");});});
