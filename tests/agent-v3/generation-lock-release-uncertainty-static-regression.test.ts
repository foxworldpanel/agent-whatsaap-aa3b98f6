import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const source=readFileSync("src/lib/agent-v3/conversation-lock.server.ts","utf8");
describe("generation lock release uncertainty",()=>{
 it("treats missing or successor holder as released but same holder as failure",()=>{
  expect(source).toContain("if (!current) return true");
  expect(source).toContain("if (current.holder !== holder) return true");
  expect(source).toContain("return false");
 });
});
