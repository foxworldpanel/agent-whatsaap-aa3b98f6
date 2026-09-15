import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const migration=readFileSync("supabase/migrations/20260914360000_stage_b_turn_member_status_invariant.sql","utf8");
describe("Customer Turn Stage B membership invariant",()=>{
 it("serializes attachment with the canonical conversation fence",()=>{expect(migration).toContain("pg_advisory_xact_lock(hashtextextended(v_conversation_id::text,31))");});
 it("discovers the conversation without a row lock and revalidates identity after the advisory fence",()=>{const fence=migration.indexOf("PERFORM pg_advisory_xact_lock");const authoritative=migration.indexOf("SELECT status,claimed_by",fence);expect(fence).toBeGreaterThan(0);expect(authoritative).toBeGreaterThan(fence);expect(migration).not.toContain("FOR UPDATE");expect(migration).toContain("id=NEW.job_id AND message_id=NEW.message_id AND conversation_id=v_conversation_id");});
 it("requires an unclaimed pending Stage B job at insert time",()=>{expect(migration).toContain("v_status<>'pending' OR v_claimed_by IS NOT NULL");expect(migration).toContain("BEFORE INSERT ON public.agent_customer_turn_messages");});
});
