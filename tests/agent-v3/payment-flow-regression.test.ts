import { describe,expect,it } from "vitest";import { detectConversationContext } from "../../src/lib/agent-v3/selector/module-selector.server";import fs from "node:fs";
const p1=fs.readFileSync("src/lib/agent-v3/prompt/prompt-p1.server.ts","utf8");
describe("Agent V3 payment flow regression",()=>{
 it.each(["manda o pix","manda pix","me passa o pix","qual o pix","quero pagar","onde pago"])("classifica %s como pagamento/fechamento",(message)=>{const ctx=detectConversationContext(message,[]);expect(ctx.intent).toBe("pagamento");expect(ctx.stage).toBe("fechamento");expect(ctx.hasPaymentSignal).toBe(true)});
 it("pagamento vence sinal genérico de compra",()=>{expect(detectConversationContext("quero pagar agora",[]).intent).toBe("pagamento")});
 it("prompt canônico proíbe link como pré-requisito e para de qualificar no fechamento",()=>{expect(p1).toContain("NUNCA pede o link da música/vídeo");expect(p1).toContain("Intenção de pagamento → nunca volta para qualificação");expect(p1).toContain("Cliente quer FECHAR. Para de qualificar");expect(p1).toContain("Nunca pede link como pré-requisito para fechar/pagar")});
});
