import { describe,expect,it } from "vitest";import fs from "node:fs";import { detectConversationContext } from "../../src/lib/agent-v3/selector/module-selector.server";
const runtime=fs.readFileSync("src/lib/agent-v3/runtime.server.ts","utf8");const p1=fs.readFileSync("src/lib/agent-v3/prompt/prompt-p1.server.ts","utf8");const p2=fs.readFileSync("src/lib/agent-v3/prompt/prompt-p2.server.ts","utf8");
describe("Atendimento consultivo e humano",()=>{
 it("entende objetivo de engajamento",()=>{const ctx=detectConversationContext("Eu gostaria de engajar minha música",[]);expect(ctx.hasGrowthGoal).toBe(true);expect(ctx.intent).toBe("descoberta");expect(ctx.stage).toBe("apresentacao")});
 it("prioriza dúvida factual antes da oferta",()=>{expect(p1).toContain("Pergunta factual");expect(p1).toContain("tem prioridade sobre empurrar preço")});
 it("permite quebrar explicação em mensagens",()=>{expect(p2).toContain("===SPLIT===");expect(p2).toContain("divide em 2-3 mensagens")});
 it("agrupa rajadas no runtime effectful",()=>{expect(runtime).toContain("let effectiveAgentMessage = finalMsgText");expect(runtime).toContain("effectiveAgentMessage = burstBodies.join")});
 it("decisão comercial usa o mesmo turno agregado",()=>{expect(runtime).toContain("message: effectiveAgentMessage");expect(runtime).toContain("deriveBusinessDecisionV3({")});
});
