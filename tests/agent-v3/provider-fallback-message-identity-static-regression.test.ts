import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const provider=readFileSync("src/lib/agent-v3/provider-message-identity.server.ts","utf8");
const canonical=readFileSync("src/lib/agent-v3/inbound-message-identity.server.ts","utf8");
describe("providerless fallback identity",()=>{
 it("delegates to the single UUID-based canonical helper",()=>{
  expect(provider).toContain("buildFallbackInboundMessageId as buildProviderFallbackMessageId");
  expect(provider).not.toContain("randomUUID");
  expect(provider).not.toContain("Date.now");
  expect(canonical).toContain("randomUUID()");
  expect(canonical).not.toContain("Date.now");
  expect(canonical).not.toContain("10000");
  expect(canonical).not.toContain("charCodeAt");
 });
});
