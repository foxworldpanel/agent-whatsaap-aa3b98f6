import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), "utf8");

describe("Agent V3 workspace propagation", () => {
  it("passes the current workspace from playground to the orchestrator", () => {
    const source = read("src/lib/agent-v3/admin/playground.functions.ts");
    expect(source).toMatch(/runAgentV3Turn\(\{[\s\S]*?workspaceId,/);
  });

  it("allows router callers to propagate workspace and conversation identity", () => {
    const source = read("src/lib/agent-v3/router.server.ts");
    expect(source).toContain("workspaceId?: string;");
    expect(source).toContain("workspaceId: input.workspaceId");
    expect(source).toContain("conversationId: input.conversationId");
    expect(source).toContain("phone: input.phone");
  });

  it("keeps the public test webhook disabled unless explicitly enabled", () => {
    const source = read("src/routes/api/public/hooks/v3-test-webhook.ts");
    expect(source).toContain('process.env.V3_TEST_WEBHOOK_ENABLED !== "true"');
    expect(source).toContain('.select("user_id, workspace_id")');
    expect(source).toContain("workspaceId: num?.workspace_id ?? undefined");
  });
});
