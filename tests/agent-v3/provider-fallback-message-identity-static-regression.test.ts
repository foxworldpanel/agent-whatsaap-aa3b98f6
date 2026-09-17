import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const source=readFileSync("src/lib/agent-v3/provider-message-identity.server.ts","utf8");
describe("providerless fallback identity",()=>{
 it("uses random UUID rather than a time/content bucket",()=>{expect(source).toContain("randomUUID()");expect(source).not.toContain("Date.now");expect(source).not.toContain("10000");expect(source).not.toContain("charCodeAt");});
});
