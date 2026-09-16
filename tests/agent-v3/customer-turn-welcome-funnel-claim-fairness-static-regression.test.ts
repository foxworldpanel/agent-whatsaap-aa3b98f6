import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const sql=readFileSync("supabase/migrations/20260914401500_customer_turn_claim_skips_welcome_funnel.sql","utf8");
describe("Customer Turn claimant skips Welcome Funnel barriers",()=>{it("filters before and revalidates after seed-31 fence",()=>{
 expect(sql.match(/welcome_funnel_execution_state/g)?.length).toBeGreaterThanOrEqual(4);
 expect(sql).toContain("s.status IN ('running','needs_review')");
 expect(sql).toContain("pg_try_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31))");
 expect(sql).toContain("LIMIT 32");
 expect(sql).toContain("NOT EXISTS(SELECT 1 FROM public.welcome_funnel_execution_state");
});});
