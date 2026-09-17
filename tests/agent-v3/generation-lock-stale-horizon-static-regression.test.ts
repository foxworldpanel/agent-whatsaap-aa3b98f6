import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const source=readFileSync("src/lib/agent-v3/conversation-lock.server.ts","utf8");
describe("generation lock canonical stale horizon",()=>{
 it("keeps twenty-minute application cutoff",()=>{expect(source).toContain("DB_CONVERSATION_LOCK_STALE_MS = 20 * 60 * 1000");});
});
