import { describe, expect, it } from "vitest";
import fs from "node:fs";

const orchestrator=fs.readFileSync("src/lib/agent-v3/orchestrator.server.ts","utf8");
const p1=fs.readFileSync("src/lib/agent-v3/prompt/prompt-p1.server.ts","utf8");
const p2=fs.readFileSync("src/lib/agent-v3/prompt/prompt-p2.server.ts","utf8");
const postSale=fs.readFileSync("src/lib/agent-v3/prompt/prompt-post-sale.server.ts","utf8");
const banned=fs.readFileSync("src/lib/agent-v3/prompt/banned-phrases-filter.server.ts","utf8");

describe("Lapidação de venda e pós-venda",()=>{
 it("mantém pós-venda autoritativo no módulo canônico",()=>{
  expect(p1).toContain("POS_VENDA_PROMPT");
  expect(postSale).toContain("PÓS-VENDA (cliente já comprou");
  expect(postSale).toContain("Direcione IMEDIATAMENTE pro Suporte");
  expect(postSale).toContain("Se o cliente quiser comprar algo NOVO");
 });
 it("não usa link enviado como prova de pedido e mantém painel como executor",()=>{
  expect(p1).toContain("Se o cliente mandar o link espontaneamente");
  expect(p1).toContain("nunca diga que \"vai seguir com o pedido\"");
  expect(p1).toContain("a Júlia não cria pedido pelo WhatsApp");
 });
 it("não inventa diferença comercial entre variantes",()=>{
  expect(p1).toContain("Preço/serviço que você mesmo já confirmou");
  expect(p2).toContain("Responde direto ao que foi perguntado");
  expect(orchestrator).toContain("não escolhemos por conta própria");
 });
 it("reduz encerramentos repetitivos por prompt e filtro determinístico",()=>{
  expect(p2).toContain("PROIBIDO usar \"qualquer dúvida é só chamar\"");
  expect(p2).toContain("não force continuação");
  expect(orchestrator).toContain("removeBannedClosingPhrasesV3(finalContent)");
  expect(banned).toContain("BANNED_CLOSING_PATTERNS");
 });
});
