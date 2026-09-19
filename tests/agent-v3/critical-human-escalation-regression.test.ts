import { describe,expect,it } from "vitest";import fs from "node:fs";
const runtime=fs.readFileSync("src/lib/agent-v3/runtime.server.ts","utf8");const support=fs.readFileSync("src/lib/agent-v3/runtime-support.server.ts","utf8");const orchestrator=fs.readFileSync("src/lib/agent-v3/orchestrator.server.ts","utf8");
describe("Critical support -> human escalation",()=>{
 it("detecta risco jurídico e reclamação crítica no suporte canônico",()=>{for(const q of ["detectCriticalHumanEscalation","denuncia","procon","advogad","supportUnavailable","unresolvedSupport"])expect(support).toContain(q)});
 it("desliga agente e marca revisão humana",()=>{expect(runtime).toContain("agent_enabled: false");expect(runtime).toContain("needs_review: true");expect(runtime).toContain("critical_human_escalation")});
 it("intercepta antes da execução do agente",()=>{const escalation=runtime.indexOf("detectCriticalHumanEscalation({");const agent=runtime.indexOf("executeAgent(",escalation);expect(escalation).toBeGreaterThanOrEqual(0);expect(agent).toBeGreaterThan(escalation)});
 it("grava intelligence coerente",()=>{expect(runtime).toContain('intent: "Reclamação"');expect(runtime).toContain('sentiment: "Negativo"');expect(runtime).toContain('urgency: "Alta"');expect(runtime).toContain("human_escalation: true")});
 it("fallback do orchestrator mantém reclamação crítica",()=>{expect(orchestrator).toContain("criticalComplaintSignal");expect(orchestrator).toContain('? "Reclamação"');expect(orchestrator).toContain('? "Alta"')});
});
