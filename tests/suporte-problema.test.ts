/**
 * Guardrail textual da REGRA_SUPORTE_PROBLEMA_BLOCK e do template Mind.
 *
 * Cobre 3 regras vindas de conversa real:
 *  1) Saudação + conteúdo (cliente manda "Ola, sumiu" → Júlia SAÚDA antes de investigar).
 *  2) NUNCA pedir "ID do pedido" isolado por texto — só PRINT do painel.
 *  3) Escalação: 1ª menção → print; 2ª+ ou sem print → ticket direto.
 */
import { describe, expect, it } from "vitest";
import {
  REGRA_SUPORTE_PROBLEMA_BLOCK,
  buildSharedRules,
  DEFAULT_IDENTITY,
  MIND_BRAND_TEMPLATE,
  mergeIdentity,
} from "@/lib/agent-identity.server";

describe("REGRA_SUPORTE_PROBLEMA_BLOCK", () => {
  it("1) cobre saudação + conteúdo com exemplo do incidente real", () => {
    expect(REGRA_SUPORTE_PROBLEMA_BLOCK).toMatch(/SAUDA[ÇC][ÃA]O COM CONTE[ÚU]DO/i);
    expect(REGRA_SUPORTE_PROBLEMA_BLOCK).toMatch(/Ola\s*,\s*sumil/);
    expect(REGRA_SUPORTE_PROBLEMA_BLOCK).toMatch(/Boa noite!/);
    expect(REGRA_SUPORTE_PROBLEMA_BLOCK).toMatch(/NUNCA pule direto/i);
  });

  it("2) proíbe pedir 'ID do pedido' como texto isolado", () => {
    expect(REGRA_SUPORTE_PROBLEMA_BLOCK).toMatch(/NUNCA PE[ÇC]A "ID DO PEDIDO"/i);
    expect(REGRA_SUPORTE_PROBLEMA_BLOCK).toMatch(/me manda o ID do pedido/i);
    expect(REGRA_SUPORTE_PROBLEMA_BLOCK).toMatch(/qual o n[úu]mero do seu pedido/i);
    expect(REGRA_SUPORTE_PROBLEMA_BLOCK).toMatch(/pe[çc]a PRINT/i);
  });

  it("2b) permite explicitamente incluir ID DENTRO de um ticket (não é o mesmo problema)", () => {
    expect(REGRA_SUPORTE_PROBLEMA_BLOCK).toMatch(/DENTRO de um ticket[^]*PERMITIDO/i);
  });

  it("3) escalação: 1ª menção pede print; sem print / 2+ insistências vai direto pro ticket", () => {
    expect(REGRA_SUPORTE_PROBLEMA_BLOCK).toMatch(/1[ªa]\s*menção[^]*PRINT/i);
    expect(REGRA_SUPORTE_PROBLEMA_BLOCK).toMatch(/2\+\s*vezes/i);
    expect(REGRA_SUPORTE_PROBLEMA_BLOCK).toMatch(/abrir ticket no Suporte do painel DIRETAMENTE/i);
  });

  it("está injetado no system prompt via buildSharedRules", () => {
    const shared = buildSharedRules(DEFAULT_IDENTITY);
    expect(shared).toContain(REGRA_SUPORTE_PROBLEMA_BLOCK);
  });
});

describe("MIND_BRAND_TEMPLATE.persona — sem instrução problemática de ID isolado", () => {
  it("template atualizado NÃO instrui mais 'informando o ID do pedido' como texto", () => {
    expect(MIND_BRAND_TEMPLATE.persona).not.toMatch(/informando o ID do pedido/i);
  });

  it("template preserva menção factual a 'número do pedido' como CAMPO do painel", () => {
    // Cliente vê no painel: número do pedido, data, contagem inicial, link, status.
    // Isso é descrição de UI, não pedido pra passar por texto — pode continuar.
    expect(MIND_BRAND_TEMPLATE.persona).toMatch(/n[úu]mero do pedido, data e hora, contagem inicial/i);
  });

  it("template agora orienta PRINT primeiro em queda/reposição, ticket como escalação", () => {
    expect(MIND_BRAND_TEMPLATE.persona).toMatch(/PRINT do hist[óo]rico do painel/i);
    expect(MIND_BRAND_TEMPLATE.persona).toMatch(/nunca peça o número do pedido isolado/i);
  });

  it("shared prompt (persona Mind mesclada) não contém mais 'informando o ID do pedido'", () => {
    const identity = mergeIdentity({ persona: MIND_BRAND_TEMPLATE.persona });
    const shared = buildSharedRules(identity);
    expect(shared).not.toMatch(/informando o ID do pedido/i);
    // regra de suporte deve estar presente pra reforçar o comportamento
    expect(shared).toMatch(/NUNCA PE[ÇC]A "ID DO PEDIDO"/i);
  });
});