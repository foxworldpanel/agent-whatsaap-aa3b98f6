import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const identity=readFileSync("supabase/migrations/20260914473000_generation_lock_identity_immutability.sql","utf8");
describe("generation lock identity guard privacy",()=>{
 it("keeps guard unavailable to client roles",()=>{
  expect(identity).toContain("REVOKE ALL ON FUNCTION public.guard_agent_generation_lock_update() FROM PUBLIC,anon,authenticated");
 });
});
