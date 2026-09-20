import { readFileSync } from "node:fs";import { describe,expect,it } from "vitest";
const legacy=readFileSync("src/lib/agent-v3/inbound-job-dispatch.server.ts","utf8");
const recovery=readFileSync("src/lib/agent-v3/inbound-recovery.server.ts","utf8");
const turns=readFileSync("src/lib/agent-v3/customer-turn-dispatch.server.ts","utf8");
const publicWorker=readFileSync("src/routes/api/public/hooks/agent-inbound-dispatcher.ts","utf8");
describe("runtime ownership module isolation",()=>{
 it("keeps stale recovery out of legacy direct runtime dispatcher",()=>{expect(legacy).not.toContain("recoverStaleAgentInboundJobs");expect(legacy).not.toContain("recoverAgentInboundDispatcherClaims");expect(recovery).toContain("recoverStaleAgentInboundJobs");});
 it("public worker no longer invokes isolated legacy Stage B executor",()=>{expect(publicWorker).toContain("dispatchCustomerTurnBatch");expect(publicWorker).not.toContain("dispatchAgentInboundBatch");});
 it("uses collision-resistant Customer Turn ownership tokens",()=>{expect(turns).toContain('import { randomUUID } from "node:crypto"');expect(turns).toContain("customer-turn-fast:${workerId}:${randomUUID()}");expect(turns).toContain("customer-turn:${workerId}:${randomUUID()}");expect(turns).not.toContain("customer-turn-fast:${workerId}:${Date.now()}");});
 it("legacy dispatcher remains collision-resistant even though it is isolated from public runtime",()=>{expect(legacy).toContain('import { randomUUID } from "node:crypto"');expect(legacy).toContain("dispatcher-select:${workerId}:${randomUUID()}");expect(legacy).toContain("dispatcher:${workerId}:${randomUUID()}");});
});
