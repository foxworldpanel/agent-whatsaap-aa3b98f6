import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const source=readFileSync("src/lib/agent-v3/conversation-lock.server.ts","utf8");
describe("generation lock recovery cutoff",()=>{
 it("uses the same canonical stale horizon by default",()=>{
  expect(source).toContain("staleMs = DB_CONVERSATION_LOCK_STALE_MS");
 });
});
