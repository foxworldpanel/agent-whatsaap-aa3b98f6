import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const src=readFileSync("src/lib/agent-v3/conversation-lock-heartbeat.server.ts","utf8");
describe("generation lock heartbeat",()=>{it("refreshes exact durable holder and stops on uncertainty/loss",()=>{
 expect(src).toContain("refreshAgentConversationLock");
 expect(src).toContain("60_000");
 expect(src).toContain("if(!owned)");
 expect(src).toContain("clearInterval(timer)");
});});
