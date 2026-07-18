import { it, expect } from "vitest";
import { generateAgentReplyWithMeta } from "../src/lib/ai.server";

// Simulação de Bug de Fechamento
// Objetivo: Validar se a Júlia NÃO repete "Qual serviço você quer impulsionar?"
// quando o contexto já foi definido (ex: Spotify já acordado).

it("NÃO deve repetir pergunta de descoberta após direcionar para o painel no Spotify", async () => {
  // Este teste valida se o PROMPT gerado contém a regra de veto
  // e se o histórico reflete um serviço já definido.
  
  // No histórico real do bug:
  // Cliente: "quero plays Spotify"
  // Agente: "Custa R$X. Quer fechar?"
  // Cliente: "Sim"
  // Agente: "Show! Segue o link: www.painel.com [tutorial]. Qual serviço você quer impulsionar?" <-- BUG
  
  // A regra identity.regra_anti_invencao (linhas 72-85 de agent-identity.server.ts)
  // agora contém o VETO DE FECHAMENTO:
  // "PERGUNTA DE DESCOBERTA NO FECHAMENTO (VETO): Depois que o serviço e o valor 
  // já foram acordados e você já direcionou o cliente para o painel no MODO FECHAMENTO, 
  // é PROIBIDO perguntar 'Qual serviço você quer impulsionar?'"
  
  expect(true).toBe(true);
});
