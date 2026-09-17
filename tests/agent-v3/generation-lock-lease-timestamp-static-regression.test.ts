import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const identity=readFileSync("supabase/migrations/20260914473000_generation_lock_identity_immutability.sql","utf8");
describe("generation lock lease timestamp remains mutable",()=>{
 it("identity guard does not reject acquired_at refresh",()=>{
  expect(identity).not.toContain("NEW.acquired_at IS DISTINCT FROM OLD.acquired_at");
 });
});
