// Regressão: a trava "verbose loop / suporte humanizado" NUNCA pode
// disparar quando o cliente confirma a compra escolhendo um pacote,
// mesmo com frase curta. Bug real de produção 09/07: "Esse pacote de
// 49,90" foi interpretado como conversa presa e a Júlia encerrou a
// venda em vez de avançar pro fechamento.

import { describe, expect, it } from "vitest";
import {
  detectVerboseLoop,
  looksLikeConcreteAction,
  type LoopMsg,
} from "@/lib/verbose-loop-guard.server";

const PURCHASE_CONFIRMATIONS = [
  "Esse pacote de 49,90",
  "Quero esse",
  "Fecho com esse",
  "Pode ser esse mesmo",
  "Vou querer esse aí",
  "Fico com o de 1000",
  "Quero o de R$97",
  "Esse pacote mesmo",
  "Vou querer o de 49,90",
  "Pode ser essa opção",
];

function longStalledHistory(): LoopMsg[] {
  // 16 mensagens genéricas simulando "conversa longa" — dispararia
  // long_without_progress + repeated_explanations facilmente.
  const h: LoopMsg[] = [];
  for (let i = 0; i < 8; i++) {
    h.push({
      sender: "agente",
      body: "Funciona assim: é bem simples, você escolhe o pacote no painel, coloca saldo via pix e a gente processa. Quantas músicas quer divulgar?",
    });
    h.push({
      sender: "cliente",
      body: "sou meio leigo nisso, pode explicar de novo?",
    });
  }
  return h;
}

describe("verbose-loop: exceção de confirmação de compra", () => {
  for (const phrase of PURCHASE_CONFIRMATIONS) {
    it(`reconhece "${phrase}" como ação concreta`, () => {
      expect(looksLikeConcreteAction(phrase)).toBe(true);
    });

    it(`NÃO dispara a trava quando o cliente diz "${phrase}" mesmo após conversa longa`, () => {
      const det = detectVerboseLoop({
        history: longStalledHistory(),
        latestClientBody: phrase,
      });
      expect(det.triggered).toBe(false);
    });
  }

  it("ainda dispara para cliente genuinamente confuso sem confirmação de compra", () => {
    const det = detectVerboseLoop({
      history: longStalledHistory(),
      latestClientBody: "não entendi nada, como assim?",
    });
    expect(det.triggered).toBe(true);
  });
});