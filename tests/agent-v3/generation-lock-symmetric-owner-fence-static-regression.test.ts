import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const acquire=readFileSync("supabase/migrations/20260914460000_generation_lock_acquire_welcome_funnel_fence.sql","utf8");
const insertGuard=readFileSync("supabase/migrations/20260914454500_generation_lock_insert_welcome_funnel_fence.sql","utf8");

describe("generation lock symmetric durable owner fences",()=>{
 it("keeps Customer Turn and Welcome Funnel fences on direct insert",()=>{
  expect(insertGuard).toContain("t.state IN ('processing_safe','processing')");
  expect(insertGuard).toContain("f.status='running'");
 });
 it("keeps Stage B, Customer Turn and Welcome Funnel fences on canonical acquisition",()=>{
  expect(acquire).toContain("j.status IN ('processing_safe','processing')");
  expect(acquire).toContain("t.state IN ('processing_safe','processing')");
  expect(acquire).toContain("f.status='running'");
 });
});
