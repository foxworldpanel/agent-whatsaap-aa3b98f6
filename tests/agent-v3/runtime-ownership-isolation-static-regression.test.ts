import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const legacy = read("src/lib/agent-v3/inbound-job-dispatch.server.ts");
const recovery = read("src/lib/agent-v3/inbound-recovery.server.ts");
const turns = read("src/lib/agent-v3/customer-turn-dispatch.server.ts");

describe("runtime ownership module isolation", () => {
  it("keeps stale recovery out of the legacy direct runtime dispatcher", () => {
    expect(legacy).not.toContain("recoverStaleAgentInboundJobs");
    expect(legacy).not.toContain("recoverAgentInboundDispatcherClaims");
    expect(recovery).toContain("recoverStaleAgentInboundJobs");
  });

  it("uses collision-resistant Customer Turn ownership tokens", () => {
    expect(turns).toContain('import { randomUUID } from "node:crypto"');
    expect(turns).toContain("customer-turn-fast:${workerId}:${randomUUID()}");
    expect(turns).toContain("customer-turn:${workerId}:${randomUUID()}");
    expect(turns).not.toContain("customer-turn-fast:${workerId}:${Date.now()}");
    expect(turns).not.toContain("customer-turn:${workerId}:${Date.now()}");
  });
});
