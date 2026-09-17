import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const identity=readFileSync("supabase/migrations/20260914473000_generation_lock_identity_immutability.sql","utf8");
describe("generation lock update defense",()=>{
 it("installs an update trigger rather than relying only on grants",()=>{
  expect(identity).toContain("DROP TRIGGER IF EXISTS agent_generation_locks_update_guard");
  expect(identity).toContain("CREATE TRIGGER agent_generation_locks_update_guard");
 });
});
