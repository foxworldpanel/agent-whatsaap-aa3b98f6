import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "src/routes/api/public/hooks/uazapi-webhook.ts"),
  "utf8",
);

describe("Uazapi webhook — durable AI safety gates", () => {
  it("respects the global agent toggle before durable ownership", () => {
    expect(source).toContain('.from("agent_config")');
    expect(source).toContain("agentConfig?.agent_enabled === false");
    expect(source).toContain('new Response("ok (agent disabled globally)")');
  });

  it("delegates the per-conversation pause/review decision to the shared Agent V3 gate", () => {
    expect(source).toContain("isConversationAgentEnabledV3(supabaseAdmin, conversationId)");
    expect(source).toContain('new Response("ok (agent disabled for conversation)")');
  });

  it("keeps audio as durable inbound data instead of transcribing or invoking the LLM inline", () => {
    expect(source).toContain("audio_url: content.mediaUrl || undefined");
    expect(source).toContain("inputKind: content.kind");
    expect(source).toContain("inputMime: content.mime");
    expect(source).not.toContain("transcribeAudio");
    expect(source).not.toContain("runAgentV3Turn(");
    expect(source).not.toContain("executeAgent(");
  });

  it("never acknowledges Agent ownership when inbound CRM persistence failed", () => {
    const persistenceGuard = source.indexOf("if (!messagePersistedInDb && !duplicateMessageInDb)");
    const durableOwnership = source.indexOf("enqueueWebhookInboundAroundWelcomeFunnel(");

    expect(persistenceGuard).toBeGreaterThan(-1);
    expect(source).toContain('return new Response("retry (crm sync incomplete)", { status: 503 })');
    expect(durableOwnership).toBeGreaterThan(persistenceGuard);
    expect(source).toContain('return new Response("ok (agent customer turn durable)")');
  });
});
