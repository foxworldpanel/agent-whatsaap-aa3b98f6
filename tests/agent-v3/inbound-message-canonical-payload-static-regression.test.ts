import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const source=readFileSync("src/lib/agent-v3/inbound-jobs.server.ts","utf8");
describe("Stage B durable message payload identity",()=>{
 it("canonicalizes every inbound body from the persisted message",()=>{
  expect(source).toContain("canonicalizeInboundMessageSnapshot");
  expect(source).toContain('.from("messages").select("body,workspace_id,conversation_id")');
  expect(source).toContain('inputText:String(data.body??"")');
  expect(source).not.toContain("canonicalizeDeferredFunnelSnapshot");
 });
 it("does not preserve webhook-local deferred payload substitution",()=>{
  expect(source).toContain("deferredFunnel:false");
  expect(source).toContain("data.conversation_id!==input.conversationId");
  expect(source).toContain("data.workspace_id!==input.workspaceId");
 });
});
