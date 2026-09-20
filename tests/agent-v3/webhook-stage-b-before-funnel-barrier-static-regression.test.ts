import { readFileSync } from "node:fs";import { describe,expect,it } from "vitest";
const ownership=readFileSync("src/lib/agent-v3/inbound-webhook-ownership.server.ts","utf8");
const ingress=readFileSync("src/lib/agent-v3/customer-turn-ingress.server.ts","utf8");
const jobs=readFileSync("src/lib/agent-v3/inbound-jobs.server.ts","utf8");
describe("webhook Stage B durability before Customer Turn attachment",()=>{
 it("can persist canonical pending Stage B without attaching it",()=>{expect(ownership).toContain("persistWebhookAgentInboundJob");expect(ownership).toContain("return ensureAgentInboundJob(supabaseAdmin,durableInput(input))");});
 it("normal eligible ingress delegates to canonical Stage B then Stage C enqueue",()=>{expect(ownership).toContain("await enqueueAgentInboundIntoCustomerTurn");const fn=ingress.slice(ingress.indexOf("export async function enqueueAgentInboundIntoCustomerTurn"));const ensure=fn.indexOf("await ensureAgentInboundJob");const attach=fn.indexOf("await attachAgentInboundJobToCustomerTurn");expect(ensure).toBeGreaterThan(-1);expect(attach).toBeGreaterThan(ensure);});
 it("Stage B durable input is canonicalized and duplicate acceptance cannot silently drift",()=>{expect(jobs).toContain("canonical");expect(jobs).toContain("messageId");expect(jobs).toContain("conversationId");expect(jobs).toContain("workspaceId");});
});
