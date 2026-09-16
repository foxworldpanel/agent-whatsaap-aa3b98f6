import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const migration=readFileSync("supabase/migrations/20260914400000_pending_attachment_welcome_funnel_fairness.sql","utf8");
describe("pending attachment Welcome Funnel fairness",()=>{it("skips funnel-owned conversations before and after seed-31 acquisition",()=>{expect(migration.match(/welcome_funnel_execution_state/g)?.length??0).toBeGreaterThanOrEqual(2);expect(migration).toContain("s.status IN ('running','needs_review')");expect(migration).toContain("pg_try_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31))");expect(migration).toContain("DISTINCT ON (j.conversation_id)");});});
