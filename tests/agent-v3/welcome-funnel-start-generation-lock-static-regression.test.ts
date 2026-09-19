import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const historical=readFileSync("supabase/migrations/20260914413000_welcome_funnel_start_requires_generation_lock.sql","utf8");
const finalStart=readFileSync("supabase/migrations/20260914521500_welcome_funnel_start_primary_identity_fence.sql","utf8");
describe("Welcome Funnel durable start ownership",()=>{
 it("historically requires the canonical conversation generation lock before running state can exist",()=>{expect(historical).toContain("pg_advisory_xact_lock(hashtextextended(NEW.conversation_id::text,31))");expect(historical).toContain("agent_generation_locks");expect(historical).toContain("Welcome Funnel start requires conversation generation lock");expect(historical).toContain("processing_safe','processing");});
 it("final start proves exact holder and full durable routing identity under seed 31",()=>{expect(finalStart).toContain("pg_advisory_xact_lock(hashtextextended(p_conversation_id::text,31))");expect(finalStart).toContain("conversation_id=p_conversation_id AND holder=p_holder");expect(finalStart).toContain("v_conversation_id IS DISTINCT FROM p_conversation_id");expect(finalStart).toContain("v_user_id IS DISTINCT FROM p_user_id");expect(finalStart).toContain("v_workspace_id IS DISTINCT FROM p_workspace_id");expect(finalStart).toContain("Welcome Funnel start blocked by conversation routing identity mismatch");expect(finalStart).toContain("state IN('processing_safe','processing')");expect(finalStart).toContain("status IN('processing_safe','processing')");});
});
