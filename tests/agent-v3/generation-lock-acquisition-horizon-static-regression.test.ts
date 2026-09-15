import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source=readFileSync("src/lib/agent-v3/conversation-lock.server.ts","utf8");

describe("generation lock acquisition stale horizon",()=>{
 it("does not consider a legitimate long-running funnel stale after five minutes",()=>{
  expect(source).toContain("DB_CONVERSATION_LOCK_STALE_MS = 20 * 60 * 1000");
  expect(source).not.toContain("DB_CONVERSATION_LOCK_STALE_MS = 5 * 60 * 1000");
  expect(source).toContain("p_stale_before: staleBefore");
 });
});
