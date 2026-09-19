import { describe,expect,it } from "vitest";import fs from "node:fs";
import { shouldStaySilentForNaturalConversation } from "../../src/lib/agent-v3/brain/guards.server";
const runtime=fs.readFileSync("src/lib/agent-v3/runtime.server.ts","utf8");const p1=fs.readFileSync("src/lib/agent-v3/prompt/prompt-p1.server.ts","utf8");
describe("Naturalidade V3",()=>{
 it("silencia pausa natural",()=>expect(shouldStaySilentForNaturalConversation({message:"Vou olhar como funciona no vídeo",history:[]})).toBe(true));
 it("não silencia pergunta",()=>expect(shouldStaySilentForNaturalConversation({message:"Vou olhar, mas onde faço o Pix?",history:[]})).toBe(false));
 it("não silencia problema",()=>expect(shouldStaySilentForNaturalConversation({message:"Não consegui fazer o pedido",history:[]})).toBe(false));
 it("mantém regras anti-robô no prompt canônico",()=>{expect(p1).toContain("Saudação em conversa já iniciada NUNCA reinicia o atendimento");expect(p1).toContain("Pergunte SOMENTE o que ainda falta");expect(p1).toContain('Cliente adiando ("depois", "ocupado")')});
 it("runtime aplica o guard de silêncio antes de responder",()=>{expect(runtime).toContain("shouldStaySilentForNaturalConversation");expect(runtime).toContain("natural conversational silence")});
});
