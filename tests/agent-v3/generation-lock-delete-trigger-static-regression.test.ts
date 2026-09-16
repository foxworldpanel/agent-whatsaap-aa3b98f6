import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe,expect,it } from "vitest";
const migration=readFileSync(resolve(process.cwd(),"supabase/migrations/20260914380000_generation_lock_delete_guard_trigger.sql"),"utf8");
const guard=readFileSync(resolve(process.cwd(),"supabase/migrations/20260914373000_generation_lock_minimum_lease_guard.sql"),"utf8");
describe("generation lock direct-delete guard",()=>{
 it("installs the hardened guard as a BEFORE DELETE trigger",()=>{expect(migration).toContain("BEFORE DELETE ON public.agent_generation_locks");expect(migration).toContain("EXECUTE FUNCTION public.guard_agent_generation_lock_delete()");});
 it("keeps direct deletion behind the canonical 20 minute horizon and seed 31",()=>{expect(guard).toContain("hashtextextended(OLD.conversation_id::text,31)");expect(guard).toContain("now() - interval '20 minutes'");});
});
