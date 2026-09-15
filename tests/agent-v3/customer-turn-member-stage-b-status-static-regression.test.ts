import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const migration=readFileSync("supabase/migrations/20260914360000_stage_b_turn_member_status_invariant.sql","utf8");
describe("Customer Turn Stage B membership invariant",()=>{
 it("serializes attachment with the canonical conversation fence",()=>{expect(migration).toContain("pg_advisory_xact_lock(hashtextextended(v_conversation_id::text,31))");});
 it("requires an unclaimed pending Stage B job at insert time",()=>{expect(migration).toContain("v_status<>'pending' OR v_claimed_by IS NOT NULL");expect(migration).toContain("BEFORE INSERT ON public.agent_customer_turn_messages");});
});
