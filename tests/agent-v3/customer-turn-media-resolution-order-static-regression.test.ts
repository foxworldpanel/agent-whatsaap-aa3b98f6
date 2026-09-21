import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source=readFileSync("src/lib/agent-v3/customer-turn-media.server.ts","utf8");

describe("Customer Turn durable media resolution ordering",()=>{
 it("persists resolved_text before best-effort CRM enrichment",()=>{
  expect(source).toMatch(/await persistResolvedText\(supabaseAdmin,member,text\);\s*await patchResolvedCrmMessage\(supabaseAdmin,member,patch\);/);
  expect(source).toContain("CRM enrichment is secondary to the durable semantic snapshot");
  expect(source).toContain("CRM message patch failed");
 });
});
