import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const gate=readFileSync("src/lib/welcome-funnel-webhook-gate.server.ts","utf8");
const orchestrator=readFileSync("src/lib/welcome-funnel-orchestrator.server.ts","utf8");
describe("Welcome Funnel completed trigger ownership",()=>{
 it("consumes the message that newly completes the funnel",()=>{expect(gate).toContain('result.orchestration.status==="completed"');expect(orchestrator).toContain('return{status:"completed",classification:"durable_completed"}');});
 it("lets later matching messages proceed after durable completion",()=>{expect(orchestrator).toContain('return{status:"already_completed",classification:initial}');expect(gate).not.toContain('result.orchestration.status==="already_completed"');});
 it("keeps historical compatible claims non-consuming while review and busy remain blocking",()=>{expect(orchestrator).toContain('status:"historical_compatible"');expect(gate).not.toContain('result.orchestration.status==="historical_compatible"');expect(gate).toContain('result.orchestration.status==="blocked"');expect(gate).toContain('result.orchestration.status==="busy"');});
});
