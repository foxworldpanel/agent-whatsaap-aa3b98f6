import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration=readFileSync("supabase/migrations/20260914351500_customer_turn_snapshot_constraints_validate.sql","utf8");

describe("Customer Turn snapshot constraint validation",()=>{
 it("validates clean historical dimensions without making dirty legacy rows block deployment",()=>{
  expect(migration).toContain("IF EXISTS");
  expect(migration).toContain("VALIDATE CONSTRAINT agent_customer_turn_member_user_present");
  expect(migration).toContain("VALIDATE CONSTRAINT agent_customer_turn_member_external_id_present");
  expect(migration).toContain("VALIDATE CONSTRAINT agent_customer_turn_member_input_kind_valid");
  expect(migration).not.toContain("DELETE FROM public.agent_customer_turn_messages");
 });
});
