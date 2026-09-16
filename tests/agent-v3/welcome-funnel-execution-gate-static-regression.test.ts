import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const src=readFileSync("src/lib/welcome-funnel-execution-gate.server.ts","utf8");
describe("Welcome Funnel durable execution gate",()=>{it("never equates ambiguous legacy claims with completion",()=>{
 expect(src).toContain('state==="unclaimed"');
 expect(src).toContain('state==="durable_completed"');
 expect(src).toContain('state==="legacy_ambiguous"');
 expect(src).toContain('state==="legacy_compatible"');
 expect(src).toContain('rpc("classify_welcome_funnel_execution"');
});});
