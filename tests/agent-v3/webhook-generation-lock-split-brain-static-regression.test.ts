import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const webhook=readFileSync("src/routes/api/public/hooks/uazapi-webhook.ts","utf8");
const shared=readFileSync("src/lib/agent-v3/conversation-lock.server.ts","utf8");
const gate=readFileSync("src/lib/welcome-funnel-webhook-gate.server.ts","utf8");

describe("webhook generation lock ownership",()=>{
 it("requires the webhook cutover to remove the local five-minute split brain",()=>{
  expect(shared).toContain("DB_CONVERSATION_LOCK_STALE_MS = 20 * 60 * 1000");
  expect(webhook).not.toContain("DB_CONVERSATION_LOCK_STALE_MS = 5 * 60 * 1000");
  expect(webhook).not.toContain('.from("agent_generation_locks")');
  expect(webhook).not.toContain("acquireConversationDbLock");
  expect(webhook).not.toContain("releaseConversationDbLock");
  expect(gate).toContain("orchestrateWelcomeFunnel");
 });
});
