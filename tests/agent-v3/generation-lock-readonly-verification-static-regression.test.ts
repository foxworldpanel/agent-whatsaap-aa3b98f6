import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const source=readFileSync("src/lib/agent-v3/conversation-lock.server.ts","utf8");
describe("generation lock uncertainty verification remains read-only",()=>{
 it("reads durable holder after uncertain RPC responses without mutating table",()=>{
  expect(source).toContain('.select("conversation_id,holder")');
  expect(source).not.toContain('.from("agent_generation_locks").insert(');
  expect(source).not.toContain('.from("agent_generation_locks").update(');
  expect(source).not.toContain('.from("agent_generation_locks").delete(');
 });
});
