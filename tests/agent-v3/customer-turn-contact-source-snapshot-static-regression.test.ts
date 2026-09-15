import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration=readFileSync(resolve(process.cwd(),"supabase/migrations/20260914344500_customer_turn_contact_source_snapshot.sql"),"utf8");
const runtime=readFileSync(resolve(process.cwd(),"src/lib/agent-v3/customer-turn-runtime.server.ts"),"utf8");
const turn=readFileSync(resolve(process.cwd(),"src/lib/agent-v3/customer-turn.server.ts"),"utf8");

describe("Customer Turn contact-source snapshot",()=>{
 it("snapshots and freezes contact source",()=>{
  expect(migration).toContain("ADD COLUMN IF NOT EXISTS contact_source text");
  expect(migration).toContain("NEW.contact_source:=v_contact.source");
  expect(migration).toContain("NEW.contact_source IS DISTINCT FROM OLD.contact_source");
 });
 it("quarantines legacy active turns under the canonical conversation fence instead of inventing history",()=>{
  expect(migration).toContain("pg_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31))");
  expect(migration).toContain("legacy Customer Turn predates durable contact_source snapshot");
  expect(migration).not.toContain("SET contact_source=ct.source");
 });
 it("loads and executes the sealed value instead of mutable CRM source",()=>{
  expect(migration).toContain("tm.contact_source,tm.resolved_text");
  expect(turn).toContain("contact_source:string|null");
  expect(runtime).toContain("contactSource:last.contact_source");
  expect(runtime).not.toContain("contactSource:context.contactSource");
 });
});
