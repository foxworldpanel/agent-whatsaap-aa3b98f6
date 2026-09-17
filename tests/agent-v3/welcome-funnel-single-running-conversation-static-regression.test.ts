import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const migration=readFileSync("supabase/migrations/20260914491500_welcome_funnel_single_running_per_conversation.sql","utf8");
describe("Welcome Funnel single active execution per conversation",()=>{
 it("quarantines every historical duplicate instead of choosing a replay winner",()=>{expect(migration).toContain("HAVING count(*)>1");expect(migration).toContain("SET status='needs_review'");expect(migration).toContain("multiple concurrent Welcome Funnel executions detected");});
 it("structurally prevents concurrent running executions",()=>{expect(migration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS welcome_funnel_execution_one_running_per_conversation");expect(migration).toContain("ON public.welcome_funnel_execution_state(conversation_id)");expect(migration).toContain("WHERE status='running'");});
});
