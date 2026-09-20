import { readFileSync } from "node:fs";import { describe,expect,it } from "vitest";
const source=readFileSync("src/lib/agent-v3/inbound-jobs.server.ts","utf8");
describe("Stage B durable inbound snapshot identity",()=>{
 it("rejects missing routing identities before durable insertion",()=>{expect(source).toContain("validateInboundSnapshot(input)");expect(source).toContain("Agent inbound workspace identity is missing");expect(source).toContain("Agent inbound send target is missing");});
 it("canonicalizes deferred funnel content only inside the same durable conversation/workspace identity",()=>{expect(source).toContain('.eq("workspace_id",input.workspaceId)');expect(source).toContain('.eq("conversation_id",input.conversationId)');expect(source).toContain("crossed its durable conversation/workspace identity");expect(source).toContain("deferredFunnel:false");});
});