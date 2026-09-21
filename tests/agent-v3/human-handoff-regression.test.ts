import { describe,expect,it } from "vitest";import fs from "node:fs";
const runtime=fs.readFileSync("src/lib/agent-v3/runtime.server.ts","utf8");const support=fs.readFileSync("src/lib/agent-v3/runtime-support.server.ts","utf8");const orchestrator=fs.readFileSync("src/lib/agent-v3/orchestrator.server.ts","utf8");const p2=fs.readFileSync("src/lib/agent-v3/prompt/prompt-p2.server.ts","utf8");
describe("Human handoff + initial greeting",()=>{
 it("detecta pedido explícito antes da execução do agente",()=>{expect(support).toContain("HUMAN_HANDOFF_PATTERNS");const handoff=runtime.indexOf("isHumanHandoffRequest(finalMsgText)");const agent=runtime.indexOf("executeAgent(",handoff);expect(handoff).toBeGreaterThanOrEqual(0);expect(agent).toBeGreaterThan(handoff)});
 it("desliga somente conversa e marca revisão",()=>{expect(runtime).toContain("agent_enabled: false");expect(runtime).toContain('review_reason: "cliente solicitou atendimento humano"');expect(runtime).toContain('source: "human_handoff"')});
 it("confirma uma vez e encerra o runtime",()=>{expect(runtime).toContain("Confirma UMA vez e encerra o turno");expect(runtime).toContain('return runtimeTerminal("human_handoff")')});
 it("limpa memória operacional",()=>expect(runtime).toContain("clearConversationStateV3"));
 it("padroniza saudação inicial sem emoji",()=>{expect(orchestrator).toContain("Aqui é a Júlia da Mind. Como posso te ajudar?");expect(p2).toContain('Evita "Bem-vindo à Mind"')});
});
