import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const jobs = source("src/lib/agent-v3/inbound-jobs.server.ts");
const webhook = source("src/routes/api/public/hooks/uazapi-webhook.ts");

describe("deferred Welcome Funnel durable snapshot", () => {
  it("never lets a newer conversation body replace another persisted message identity", () => {
    expect(webhook).not.toContain("deferredFunnelMessage = queuedBody");
    expect(webhook).not.toContain("deferredFunnelMessage || content.text");
    expect(webhook).not.toContain("Boolean(deferredFunnelMessage)");
    expect(jobs).toContain("canonicalizeDeferredFunnelSnapshot");
    expect(jobs).toContain('.from("messages").select("body")');
    expect(jobs).toContain('.eq("id",input.messageId)');
    expect(jobs).toContain('.eq("conversation_id",input.conversationId)');
    expect(jobs).toContain('inputText:String(data.body??"")');
    expect(jobs).toContain("deferredFunnel:false");
  });

  it("uses the canonicalized snapshot for both insert and duplicate comparison", () => {
    expect(jobs).toContain("const canonicalInput=await canonicalizeDeferredFunnelSnapshot(s,input)");
    expect(jobs).toContain("sameInboundSnapshot(existing,canonicalInput)");
    expect(jobs).not.toContain("sameInboundSnapshot(existing,input)");
  });
});
