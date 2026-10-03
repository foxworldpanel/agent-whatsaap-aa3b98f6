import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("Agent V3 AI credential parity", () => {
  const playground = read("src/lib/agent-v3/admin/playground.functions.ts");
  const runtime = read("src/lib/agent-v3/runtime.server.ts");
  const customerTurn = read("src/lib/agent-v3/customer-turn-runtime.server.ts");
  const resolver = read("src/lib/agent-v3/integrations/ai-credentials.server.ts");

  it("Playground, WhatsApp runtime and Customer Turn use the shared credential resolver", () => {
    expect(playground).toContain("resolveAgentAiCredentialsV3");
    expect(runtime).toContain("resolveAgentAiCredentialsV3");
    expect(customerTurn).toContain("resolveAgentAiCredentialsV3");
  });

  it("Playground does not read Anthropic env directly", () => {
    expect(playground).not.toContain("process.env.ANTHROPIC_API_KEY");
  });

  it("WhatsApp runtime does not duplicate Anthropic credential precedence", () => {
    expect(runtime).not.toContain("integ?.anthropic_api_key?.trim()");
    expect(runtime).not.toContain("process.env.ANTHROPIC_API_KEY?.trim()");
  });

  it("Customer Turn does not duplicate Anthropic credential precedence", () => {
    expect(customerTurn).not.toContain("integration?.anthropic_api_key?.trim()");
    expect(customerTurn).not.toContain("process.env.ANTHROPIC_API_KEY?.trim()");
  });

  it("shared resolver keeps database integration first and env only as fallback", () => {
    expect(resolver).toContain("integration?.anthropic_api_key?.trim()");
    expect(resolver).toContain("process.env.ANTHROPIC_API_KEY?.trim()");
    expect(
      resolver.indexOf("integration?.anthropic_api_key?.trim()"),
    ).toBeLessThan(
      resolver.indexOf("process.env.ANTHROPIC_API_KEY?.trim()"),
    );
  });
});
