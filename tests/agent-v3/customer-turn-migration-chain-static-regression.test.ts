import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const complete=readFileSync("supabase/migrations/20260914333000_complete_snapshot_quarantine_and_constraints.sql","utf8");
const routing=readFileSync("supabase/migrations/20260914340000_routing_snapshot_quarantine.sql","utf8");
const contactSource=readFileSync("supabase/migrations/20260914344500_customer_turn_contact_source_snapshot.sql","utf8");
const validation=readFileSync("supabase/migrations/20260914351500_customer_turn_snapshot_constraints_validate.sql","utf8");

describe("Customer Turn migration chain safety",()=>{
 it("does not recreate snapshot constraints under duplicate names",()=>{
  expect(existsSync("supabase/migrations/20260914350000_customer_turn_snapshot_source_presence.sql")).toBe(false);
  expect((complete.match(/agent_customer_turn_member_external_id_present/g)||[]).length).toBeGreaterThan(0);
  expect((routing.match(/agent_customer_turn_member_user_present/g)||[]).length).toBeGreaterThan(0);
 });
 it("guards conditional validation by catalog existence",()=>{
  expect(validation).toContain("FROM pg_constraint");
  expect(validation).toContain("conrelid='public.agent_customer_turn_messages'::regclass");
 });
 it("never backfills historical contact source from mutable CRM state",()=>{
  expect(contactSource).not.toContain("SET contact_source=ct.source");
  expect(contactSource).toContain("legacy Customer Turn predates durable contact_source snapshot");
  expect(contactSource).toContain("'collecting','retry_safe','processing_safe','processing'");
 });
});
