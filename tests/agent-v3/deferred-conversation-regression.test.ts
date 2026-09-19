import { describe,expect,it } from "vitest";import fs from "node:fs";
const p1=fs.readFileSync("src/lib/agent-v3/prompt/prompt-p1.server.ts","utf8");const guards=fs.readFileSync("src/lib/agent-v3/brain/guards.server.ts","utf8");
describe("Adiamento natural da conversa",()=>{
 it("não qualifica quando cliente adia",()=>{expect(p1).toContain('Cliente adiando ("depois", "ocupado")');expect(p1).toContain("NÃO faz nova pergunta comercial no mesmo turno")});
 it("silêncio natural é determinístico e perguntas/problemas não são silenciados",()=>{expect(guards).toContain("shouldStaySilentForNaturalConversation");expect(guards).toContain('if (!raw || raw.includes("?")) return false');expect(guards).toContain("nao consegui")});
 it("saudação em conversa existente não reinicia atendimento",()=>{expect(p1).toContain("Saudação em conversa já iniciada NUNCA reinicia o atendimento");expect(p1).toContain("Júlia apresentada → nunca diga")});
 it("não inventa retomada ativa: apenas reconhece adiamento no turno atual",()=>{expect(p1).toContain('Cliente adiando ("depois", "ocupado")');expect(p1).not.toContain("vou te chamar depois")});
});
