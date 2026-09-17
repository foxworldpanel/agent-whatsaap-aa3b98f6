import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const migration=readFileSync("supabase/migrations/20260914473000_generation_lock_identity_immutability.sql","utf8");
describe("generation lock identity immutability",()=>{
 it("rejects conversation or holder mutation",()=>{
  expect(migration).toContain("NEW.conversation_id IS DISTINCT FROM OLD.conversation_id");
  expect(migration).toContain("NEW.holder IS DISTINCT FROM OLD.holder");
  expect(migration).toContain("BEFORE UPDATE ON public.agent_generation_locks");
 });
});
