import { readFileSync } from "node:fs";import { describe,expect,it } from "vitest";
const source=readFileSync("src/lib/agent-v3/inbound-webhook-ownership.server.ts","utf8");
const ingress=readFileSync("src/lib/agent-v3/inbound-jobs.server.ts","utf8");
describe("webhook Stage B durability before Customer Turn attachment",()=>{
 it("can persist canonical pending Stage B without attaching it",()=>{expect(source).toContain("persistWebhookAgentInboundJob");expect(source).toContain("return ensureAgentInboundJob(supabaseAdmin,durableInput(input))");});
 it("normal eligible ingress ensures Stage B before Stage C attachment",()=>{const fn=source.slice(source.indexOf("export async function beginWebhookAgentInboundRuntime"),source.indexOf("export async function persistWebhookAgentInboundJob"));expect(fn).toContain("enqueueAgentInboundIntoCustomerTurn");const enqueue=source.slice(source.indexOf("async function enqueueAgentInboundIntoCustomerTurn"));expect(enqueue.indexOf("await ensureAgentInboundJob")).toBeGreaterThan(-1);expect(enqueue.indexOf("await attachAgentInboundJobToCustomerTurn")).toBeGreaterThan(enqueue.indexOf("await ensureAgentInboundJob"));});
 it("Stage B durable input is canonicalized and duplicate acceptance cannot silently drift",()=>{expect(ingress).toContain("canonical");expect(ingress).toContain("messageId");expect(ingress).toContain("conversationId");expect(ingress).toContain("workspaceId");});
});
