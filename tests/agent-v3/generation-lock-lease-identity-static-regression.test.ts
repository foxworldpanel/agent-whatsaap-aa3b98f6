import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const identity=readFileSync("supabase/migrations/20260914473000_generation_lock_identity_immutability.sql","utf8");
const refresh=readFileSync("supabase/migrations/20260914474500_generation_lock_refresh_canonical_fence.sql","utf8");
describe("generation lock lease identity",()=>{
 it("refreshes lease without changing owner identity",()=>{
  expect(identity).toContain("NEW.holder IS DISTINCT FROM OLD.holder");
  expect(refresh).toContain("SET acquired_at=now()");
  expect(refresh).toContain("AND holder=p_holder");
 });
});
