import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const refresh=readFileSync("supabase/migrations/20260914474500_generation_lock_refresh_canonical_fence.sql","utf8");
describe("generation lock refresh transaction ordering",()=>{
 it("serializes before updating lease",()=>{expect(refresh.indexOf("pg_advisory_xact_lock")).toBeLessThan(refresh.indexOf("UPDATE public.agent_generation_locks"));});
});
