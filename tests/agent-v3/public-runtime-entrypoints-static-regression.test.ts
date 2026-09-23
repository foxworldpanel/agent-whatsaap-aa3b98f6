import { readFileSync } from "node:fs";import { describe,expect,it } from "vitest";
const webhook=readFileSync("src/routes/api/public/hooks/uazapi-webhook.ts","utf8");
const dispatcher=readFileSync("src/routes/api/public/hooks/agent-inbound-dispatcher.ts","utf8");
const testWebhook=readFileSync("src/routes/api/public/hooks/v3-test-webhook.ts","utf8");
const ownership=readFileSync("src/lib/agent-v3/inbound-webhook-ownership.server.ts","utf8");
const turnDispatcher=readFileSync("src/lib/agent-v3/customer-turn-dispatch.server.ts","utf8");
describe("public Agent V3 runtime entrypoints",()=>{
 it("production webhook persists Stage B and routes eligible ingress through durable Customer Turns",()=>{expect(webhook).toContain("persistWebhookAgentInboundJob");expect(webhook).toContain("enqueueWebhookInboundAroundWelcomeFunnel");expect(webhook).not.toContain("dispatchReadyCustomerTurnById");expect(webhook).not.toContain("executeAgentV3Runtime(");expect(webhook).not.toContain("runAgentV3Turn(");expect(ownership).toContain("enqueueAgentInboundIntoCustomerTurn");expect(ownership).not.toContain("executeAgentV3Runtime");});
 it("public worker uses Customer Turn dispatcher rather than legacy Stage B runtime executor",()=>{expect(dispatcher).toContain("dispatchCustomerTurnBatch");expect(dispatcher).not.toContain("dispatchAgentInboundBatch");expect(dispatcher).not.toContain("inbound-dispatch-policy.server");});
 it("effectful runtime exists only behind Customer Turn sealed-input and processing transition",()=>{const fn=turnDispatcher.slice(turnDispatcher.indexOf("async function executeClaimedCustomerTurn"),turnDispatcher.indexOf("export async function dispatchReadyCustomerTurnById"));const build=fn.indexOf("await buildCustomerTurnRuntimeInput");const enter=fn.indexOf("await enterCustomerTurnRuntime");const run=fn.indexOf("await executeAgentV3Runtime");expect(build).toBeGreaterThan(-1);expect(enter).toBeGreaterThan(build);expect(run).toBeGreaterThan(enter);});
 it("historical public V3 test hook remains permanently inert",()=>{const executable=testWebhook.replace(/\/\/.*$/gm,"");expect(executable).toContain('new Response("not found", { status: 404 })');expect(executable).not.toContain("V3_TEST_WEBHOOK_ENABLED");expect(executable).not.toContain("runAgentV3Turn");expect(executable).not.toContain("executeAgentV3Runtime");expect(executable).not.toContain("supabaseAdmin");});
});
