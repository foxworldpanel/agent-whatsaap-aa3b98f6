import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const source=readFileSync("src/lib/agent-v3/inbound-webhook-ownership.server.ts","utf8");
describe("webhook Stage B durability before Customer Turn attachment",()=>{
 it("can persist a canonical pending job without attaching it",()=>{
  expect(source).toContain("persistWebhookAgentInboundJob");
  expect(source).toContain("return ensureAgentInboundJob(supabaseAdmin,durableInput(input))");
 });
 it("keeps normal eligible ingress on the Stage C attachment path",()=>{
  expect(source).toContain("beginWebhookAgentInboundRuntime");
  expect(source).toContain("enqueueAgentInboundIntoCustomerTurn(supabaseAdmin,durableInput(input))");
 });
});
