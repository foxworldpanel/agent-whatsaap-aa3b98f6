import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const sql=readFileSync(resolve(process.cwd(),"supabase/migrations/20260914334500_customer_turn_routing_identity_snapshot.sql"),"utf8");
const quarantine=readFileSync(resolve(process.cwd(),"supabase/migrations/20260914340000_routing_snapshot_quarantine.sql"),"utf8");
const runtime=readFileSync(resolve(process.cwd(),"src/lib/agent-v3/customer-turn-runtime.server.ts"),"utf8");
describe("sealed Customer Turn routing identity",()=>{
 it("snapshots non-secret routing identity",()=>{expect(sql).toContain("NEW.user_id:=v_conversation.user_id");expect(sql).toContain("NEW.contact_id:=v_conversation.contact_id");expect(sql).toContain("NEW.whatsapp_number_id:=v_conversation.whatsapp_number_id");expect(sql).toContain("NEW.contact_phone:=v_phone");});
 it("makes routing identity immutable",()=>{expect(sql).toContain("NEW.user_id IS DISTINCT FROM OLD.user_id");expect(sql).toContain("NEW.contact_phone IS DISTINCT FROM OLD.contact_phone");});
 it("fails safe instead of redirecting sealed work",()=>{expect(runtime).toContain("routing identity drifted after attachment");expect(runtime).toContain("contact phone drifted after attachment");expect(runtime).toContain("contactId:last.contact_id");expect(runtime).toContain("whatsappNumberId:last.whatsapp_number_id");});
 it("quarantines incomplete historical routing snapshots",()=>{expect(quarantine).toContain("tm.user_id IS NULL");expect(quarantine).toContain("tm.whatsapp_number_id IS NULL");expect(quarantine).toContain("pg_try_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31))");});
});
