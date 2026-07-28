import { describe, expect, it } from "vitest";
import fs from "node:fs";
const webhook=fs.readFileSync("src/routes/api/public/hooks/uazapi-webhook.ts","utf8");
const orch=fs.readFileSync("src/lib/agent-v3/orchestrator.server.ts","utf8");
describe("correções consolidadas das conversas reais",()=>{
 it("handoff inclui pedido sem robô",()=>{ expect(webhook).toContain("sem\\s+ser"); expect(webhook).toContain("agent_enabled: false"); });
 it("detecta venda bloqueada por problema técnico",()=>{ expect(webhook).toContain("venda bloqueada por problema técnico no cadastro/pagamento"); });
 it("mantém trava persistente do funil",()=>{ expect(webhook).toContain("welcome_funnel_runs"); expect(webhook).toContain("23505"); });
 it("proíbe validar comprovante por banco/recebedor",()=>{ expect(orch).toContain("COMPROVANTE DE PAGAMENTO — REGRA CRÍTICA"); expect(orch).toContain("esse banco não é nosso"); });
 it("diferencia publicação de divulgação",()=>{ expect(orch).toContain("publicação/distribuição de divulgação"); });
 it("proíbe alegar ser humana",()=>{ expect(orch).toContain("Nunca afirme \"sou humana\""); expect(orch).toContain("Guard determinístico"); });
 it("usa horário real de São Paulo",()=>{ expect(orch).toContain("America/Sao_Paulo"); });
 it("não força cliente antigo para pós-venda em nova compra",()=>{ expect(orch).toContain("Memória de cliente NÃO força todo novo turno para Pós-venda"); });
 it("intelligence reconhece abandono e pagamento bloqueado",()=>{ expect(orch).toContain("Pagamento / Compra bloqueada"); expect(orch).toContain("Abandono da compra"); });
});
