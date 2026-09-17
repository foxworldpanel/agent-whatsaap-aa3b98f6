import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const webhook = readFileSync(
  "src/routes/api/public/hooks/uazapi-webhook.ts",
  "utf8",
);

describe("UAZAPI webhook durable Welcome Funnel cutover", () => {
  it("delegates Funnel authority and generation locking to shared durable helpers", () => {
    expect(webhook).toContain("runWelcomeFunnelWebhookGate");
    expect(webhook).toContain("webhookGateMustStopAgent");
    expect(webhook).not.toContain('.from("welcome_funnel_runs")');
    expect(webhook).not.toContain('.from("agent_generation_locks")');
    expect(webhook).not.toContain("acquireConversationDbLock");
    expect(webhook).not.toContain("releaseConversationDbLock");
    expect(webhook).not.toContain("DB_CONVERSATION_LOCK_STALE_MS");
  });

  it("persists each blocked later message with its own canonical identity", () => {
    expect(webhook).toContain("persistWebhookAgentInboundJob");
    expect(webhook).toContain("messageId: persistedMessageId");
    expect(webhook).toContain('inputText: content.text || ""');
    expect(webhook).toContain("deferredFunnel: false");
    expect(webhook).not.toContain("deferredFunnelMessage");
    expect(webhook).not.toContain("queuedInbound");
    expect(webhook).not.toContain("queuedBody");
  });

  it("retries instead of losing a turn when Agent eligibility is unavailable", () => {
    expect(webhook).toContain(
      'new Response("retry (agent gate unavailable)", { status: 503 })',
    );
    expect(webhook).not.toContain(
      'new Response("ok (agent gate unavailable)")',
    );
  });

  it("rechecks the Funnel barrier before Customer Turn attachment", () => {
    expect(webhook).toContain("enqueueWebhookInboundAroundWelcomeFunnel");
    expect(webhook).toContain('ownershipResult.status === "pending_behind_funnel"');
    expect(webhook).toContain("dispatchReadyCustomerTurnById");
  });
});
