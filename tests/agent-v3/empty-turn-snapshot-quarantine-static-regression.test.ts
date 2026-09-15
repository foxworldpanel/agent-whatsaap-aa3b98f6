import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql=readFileSync(resolve(process.cwd(),"supabase/migrations/20260914343000_quarantine_empty_customer_turn_snapshots.sql"),"utf8");

describe("empty Customer Turn snapshot quarantine",()=>{
 it("detects turns with no durable members",()=>expect(sql).toContain("NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages tm WHERE tm.turn_id=t.id)"));
 it("revalidates under the canonical nonblocking conversation fence",()=>expect(sql).toContain("pg_try_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31))"));
 it("moves unreconstructable turns to review instead of burning safe retries",()=>{expect(sql).toContain("state='needs_review'");expect(sql).toContain("empty durable Customer Turn snapshot requires review");});
});
