/**
 * Reversão (08/07): aluguel de playlist voltou ao fluxo padrão de todos
 * os outros serviços — compra EXCLUSIVAMENTE pelo painel. A Júlia
 * NUNCA processa pagamento nem fecha pedido no WhatsApp.
 *
 * Este teste valida o TEXTO das instruções (não o comportamento do LLM):
 *  1) Módulo playlist_promo não contém mais o fluxo de venda manual
 *     (chave PIX, comprovante, "processo pra você").
 *  2) Módulo playlist_promo tem regra absoluta explícita de "toda
 *     compra é no painel".
 *  3) Webhook não importa mais o hook de auto-dispatch de playlist.
 *  4) REGRA_COMPRA_PAGA_BLOCK e buildRegraFechamentoTutorialBlock
 *     seguem intactos (não tinham resíduo de venda manual).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_MODULES } from "@/lib/agent-modules";
import {
  REGRA_COMPRA_PAGA_BLOCK,
  buildRegraFechamentoTutorialBlock,
} from "@/lib/agent-identity.server";

describe("Playlist voltou ao fluxo painel-only", () => {
  const mod = DEFAULT_MODULES.playlist_promo;

  it("1) módulo playlist_promo NÃO tem mais fluxo de venda manual (PIX/comprovante)", () => {
    expect(mod).not.toMatch(/chave PIX é o número/i);
    expect(mod).not.toMatch(/24981222957/);
    expect(mod).not.toMatch(/Eliseu Mendes Oliveira/i);
    expect(mod).not.toMatch(/Cliente envia comprovante/i);
    expect(mod).not.toMatch(/eu j[áa] processo pra voc[êe]/i);
    expect(mod).not.toMatch(/Recebi o pagamento/i);
    expect(mod).not.toMatch(/Agente analisa o comprovante/i);
  });

  it("2) módulo playlist_promo declara explicitamente que toda compra é no painel", () => {
    expect(mod).toMatch(/TODA compra.*aluguel de playlist.*painel/is);
    expect(mod).toMatch(/mindsmmpanel\.com/);
    expect(mod).toMatch(/NUNCA processa pagamento/i);
    expect(mod).toMatch(/NUNCA envia chave PIX/i);
    expect(mod).toMatch(/NUNCA fecha pedido diretamente pelo WhatsApp/i);
  });

  it("2b) preserva conteúdo comercial legítimo (pacotes, preço, promoção)", () => {
    expect(mod).toMatch(/PACOTE ECL[ÉE]TICA/i);
    expect(mod).toMatch(/PACOTE M[ÚU]SICA ELETR[ÔO]NICA/i);
    expect(mod).toMatch(/R\$\s*49[,.]?90/);
    expect(mod).toMatch(/PROMOÇÃO ATIVA/i);
  });

  it("3) webhook não importa mais o hook auto-dispatch de playlist-sales", () => {
    const webhookSrc = readFileSync(
      join(process.cwd(), "src/routes/api/public/hooks/uazapi-webhook.ts"),
      "utf8",
    );
    expect(webhookSrc).not.toMatch(/from\s+["']@\/lib\/playlist-sales\.server["']/);
    expect(webhookSrc).not.toMatch(/placePlaylistOrder/);
    expect(webhookSrc).not.toMatch(/detectPacoteFromText/);
    // e o comentário de reversão deve estar lá
    expect(webhookSrc).toMatch(/REVERTIDO.*playlist voltou ao fluxo padrão/i);
  });

  it("4) REGRA_COMPRA_PAGA_BLOCK e tutorial de fechamento seguem apontando para o painel", () => {
    expect(REGRA_COMPRA_PAGA_BLOCK).toMatch(/pedido direto no nosso painel/i);
    expect(REGRA_COMPRA_PAGA_BLOCK).not.toMatch(/chave PIX é o número/i);
    const tut = buildRegraFechamentoTutorialBlock(5);
    expect(tut).toMatch(/link do painel/i);
    expect(tut).toMatch(/Cadastro rapidinho/i);
    expect(tut).toMatch(/Faz uma recarga/i);
    expect(tut).not.toMatch(/chave PIX é o número/i);
  });
});