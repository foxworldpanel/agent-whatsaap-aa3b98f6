import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const source=readFileSync("src/lib/agent-v3/conversation-lock.server.ts","utf8");
describe("generation lock acquisition uncertainty",()=>{
 it("accepts success only when exact durable holder is ours",()=>{
  expect(source).toContain("if (current?.holder === holder) return true");
  expect(source).toContain("if (current && current.holder !== holder) return false");
 });
});
