import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const source=readFileSync("src/lib/agent-v3/inbound-message-identity.server.ts","utf8");
describe("providerless inbound identity",()=>{it("uses per-delivery UUID instead of content/time buckets",()=>{
 expect(source).toContain("randomUUID()");
 expect(source).not.toContain("Date.now");
 expect(source).not.toContain("content");
 expect(source).not.toContain("10000");
});});
