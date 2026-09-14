import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const hookDir = resolve(root, "src/routes/api/public/hooks");
const hookFiles = readdirSync(hookDir).filter((name) => name.endsWith(".ts"));

const forbiddenLegacyRuntimeImports = [
  "@/lib/agent-v3/inbound-dispatch-policy.server",
  "@/lib/agent-v3/inbound-job-dispatch.server",
  "@/lib/agent-v3/inbound-runtime-claim.server",
  "@/lib/agent-v3/inbound-runtime-ownership.server",
];

const forbiddenDirectCalls = [
  "dispatchAgentInboundBatch(",
  "dispatchOneAgentInbound(",
  "claimOneAgentInboundForRuntime(",
  "enterClaimedAgentInboundForRuntime(",
  "executeClaimedAgentInboundRuntime(",
];

describe("legacy Stage B direct runtime isolation", () => {
  it("keeps every public hook outside the legacy direct-execution modules", () => {
    for (const file of hookFiles) {
      const source = read(`src/routes/api/public/hooks/${file}`);
      for (const legacyImport of forbiddenLegacyRuntimeImports) {
        expect(source, `${file} imports ${legacyImport}`).not.toContain(legacyImport);
      }
      for (const directCall of forbiddenDirectCalls) {
        expect(source, `${file} calls ${directCall}`).not.toContain(directCall);
      }
    }
  });

  it("keeps the production dispatcher on Customer Turn execution", () => {
    const dispatcher = read("src/routes/api/public/hooks/agent-inbound-dispatcher.ts");
    expect(dispatcher).toContain("dispatchCustomerTurnBatch");
    expect(dispatcher).not.toContain("dispatchAgentInboundBatch");
    expect(dispatcher).not.toContain("dispatchOneAgentInbound");
  });

  it("keeps the production webhook on durable Customer Turn ownership", () => {
    const webhook = read("src/routes/api/public/hooks/uazapi-webhook.ts");
    expect(webhook).toContain("beginWebhookAgentInboundRuntime");
    expect(webhook).toContain("dispatchReadyCustomerTurnById");
    expect(webhook).not.toContain("runAgentV3Turn(");
    expect(webhook).not.toContain("executeAgentV3Runtime(");
  });
});
