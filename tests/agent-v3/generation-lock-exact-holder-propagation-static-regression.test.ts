import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const source=readFileSync("src/lib/agent-v3/conversation-lock.server.ts","utf8");
describe("generation lock application exact holder propagation",()=>{
 it("passes holder to acquire refresh and release RPCs",()=>{
  expect((source.match(/p_holder: holder/g)||[]).length).toBeGreaterThanOrEqual(3);
 });
});
