import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "src/routes/api/public/hooks/uazapi-webhook.ts"),
  "utf8",
);

describe("Uazapi webhook — AI safety gates", () => {
  it("respects the global agent toggle", () => {
    expect(source).toContain('.from("agent_config")');
    expect(source).toContain('agentConfig.agent_enabled === false');
  });

  it("respects per-conversation pause and review state", () => {
    expect(source).toContain('.select("agent_enabled, needs_review")');
    expect(source).toContain('conversationGate?.agent_enabled === false');
    expect(source).toContain('conversationGate?.needs_review === true');
  });

  it("does not send placeholder audio text to the LLM after transcription failure", () => {
    expect(source).toContain('return new Response("ok (audio transcription failed)")');
    expect(source).toContain('return new Response("ok (audio unavailable)")');
  });
});
