import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read=(name:string)=>readFileSync(resolve(process.cwd(),`supabase/migrations/${name}`),"utf8");
const deleteFence=read("20260914323000_customer_turn_member_delete_fence.sql");
const snapshotQuarantine=read("20260914324500_quarantine_incomplete_member_snapshots.sql");
const turnIdentity=read("20260914330000_customer_turn_identity_immutability.sql");
const dispatcher=readFileSync(resolve(process.cwd(),"src/lib/agent-v3/customer-turn-dispatch.server.ts"),"utf8");

describe("Customer Turn durable identity",()=>{
 it("prevents deleting source jobs/messages from cascading away attached semantic members",()=>{
  expect(deleteFence).toContain("REFERENCES public.agent_inbound_jobs(id) ON DELETE RESTRICT");
  expect(deleteFence).toContain("REFERENCES public.messages(id) ON DELETE RESTRICT");
 });

 it("quarantines incomplete legacy snapshots under the canonical conversation fence",()=>{
  expect(snapshotQuarantine).toContain("nullif(btrim(coalesce(tm.external_id,'')),'') IS NULL");
  expect(snapshotQuarantine).toContain("tm.input_kind NOT IN ('texto','audio','image','sticker')");
  expect(snapshotQuarantine).toContain("pg_try_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31))");
  expect(snapshotQuarantine).toContain("state='needs_review'");
  expect(snapshotQuarantine).toContain("j.status='pending'");
 });

 it("runs snapshot quarantine as bounded dispatcher maintenance before claims",()=>{
  const maintenance=dispatcher.indexOf("quarantineIncompleteCustomerTurnSnapshots(s,maintenanceLimit)");
  const claimLoop=dispatcher.indexOf("for(let attempt=0;attempt<maxClaimAttempts");
  expect(maintenance).toBeGreaterThan(-1);
  expect(claimLoop).toBeGreaterThan(maintenance);
 });

 it("freezes turn tenant/conversation identity while leaving state-machine fields writable",()=>{
  expect(turnIdentity).toContain("NEW.conversation_id IS DISTINCT FROM OLD.conversation_id");
  expect(turnIdentity).toContain("NEW.workspace_id IS DISTINCT FROM OLD.workspace_id");
  expect(turnIdentity).toContain("NEW.created_at IS DISTINCT FROM OLD.created_at");
  expect(turnIdentity).not.toContain("NEW.state IS DISTINCT FROM OLD.state");
  expect(turnIdentity).not.toContain("NEW.claimed_by IS DISTINCT FROM OLD.claimed_by");
 });
});
