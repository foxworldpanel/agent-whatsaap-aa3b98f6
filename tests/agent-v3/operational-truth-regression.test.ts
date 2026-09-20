import { describe, expect, it } from "vitest";
import { MIND_OPERATIONAL_TRUTH_V3 } from "../../src/lib/agent-v3/brain/operational-truth.server";
import { CADASTRO_TEXT, BANCO_ALERTA_TEXT } from "../../src/lib/agent-v3/prompt/prompt-conditional.server";
import fs from "node:fs";
const orchestrator=fs.readFileSync("src/lib/agent-v3/orchestrator.server.ts","utf8");
const runtime=fs.readFileSync("src/lib/agent-v3/runtime.server.ts","utf8");
const conversations=fs.readFileSync("src/routes/_authenticated/conversas.tsx","utf8");
describe("Operational truth + structural state",()=>{
 it("keeps global truth focused while canonical conditional blocks own registration and payment facts",()=>{
  expect(MIND_OPERATIONAL_TRUTH_V3).toContain("O cliente cria o pedido no painel");
  expect(MIND_OPERATIONAL_TRUTH_V3).toContain("Reclamações críticas ou pedido explícito de atendente");
  expect(CADASTRO_TEXT).toContain("Cadastro é só e-mail + senha criada pelo cliente");
  expect(CADASTRO_TEXT).toContain("NUNCA exige biometria, selfie, documento, RG, CNH ou CPF");
  expect(BANCO_ALERTA_TEXT).toContain("não invente a causa");
  expect(BANCO_ALERTA_TEXT).toContain("2 módulos de Pix");
 });
 it("operational truth is always injected into the system prompt",()=>{expect(orchestrator).toContain("${MIND_OPERATIONAL_TRUTH_V3}");});
 it("business decision happens before the LLM call",()=>{const decision=runtime.indexOf("deriveBusinessDecisionV3({");const prompt=runtime.indexOf("businessDecisionToPromptV3(businessDecision)",decision);const agent=runtime.indexOf("executeAgent(",prompt);expect(decision).toBeGreaterThanOrEqual(0);expect(prompt).toBeGreaterThan(decision);expect(agent).toBeGreaterThan(prompt);});
 it("conversation screen exposes state/risk/action filters",()=>{expect(conversations).toContain("Estado da conversa");expect(conversations).toContain("Próxima ação recomendada");expect(conversations).toContain("Venda bloqueada");expect(conversations).toContain("Reclamações");expect(conversations).toContain("Pagamento");});
});
