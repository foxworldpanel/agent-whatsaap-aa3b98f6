import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const webhook=readFileSync("src/routes/api/public/hooks/uazapi-webhook.ts","utf8");
const shared=readFileSync("src/lib/agent-v3/conversation-lock.server.ts","utf8");

describe("webhook generation lock ownership",()=>{
 it("documents the remaining local five-minute stale takeover until webhook is safely centralized",()=>{
  expect(shared).toContain("DB_CONVERSATION_LOCK_STALE_MS = 20 * 60 * 1000");
  expect(webhook).toContain("DB_CONVERSATION_LOCK_STALE_MS = 5 * 60 * 1000");
  expect(webhook).toContain('.from("agent_generation_locks")');
  expect(webhook).toContain('.lt("acquired_at", staleBefore)');
 });
});
