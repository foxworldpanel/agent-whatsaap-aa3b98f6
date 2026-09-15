import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration=readFileSync(resolve(process.cwd(),"supabase/migrations/20260914304500_customer_turn_media_resolution_cache.sql"),"utf8");
const media=readFileSync(resolve(process.cwd(),"src/lib/agent-v3/customer-turn-media.server.ts"),"utf8");
const turn=readFileSync(resolve(process.cwd(),"src/lib/agent-v3/customer-turn.server.ts"),"utf8");

describe("Customer Turn durable media resolution cache",()=>{
 it("stores resolved text on immutable turn membership and loads it with retries",()=>{
  expect(migration).toContain("ADD COLUMN IF NOT EXISTS resolved_text text");
  expect(migration).toContain("tm.resolved_text");
  expect(turn).toContain("resolved_text:string|null");
 });
 it("returns cached media before provider or model work",()=>{
  const cached=media.indexOf("if(cached)return cached");
  const provider=media.indexOf("uazapiResolveInboundMedia");
  expect(cached).toBeGreaterThan(-1);
  expect(provider).toBeGreaterThan(cached);
 });
 it("persists successful image and audio resolution idempotently",()=>{
  expect(media).toContain('.eq("turn_id",member.turn_id).eq("job_id",member.job_id).is("resolved_text",null)');
  expect(media.match(/await persistResolvedText\(supabaseAdmin,member,text\)/g)?.length??0).toBe(2);
 });
});
