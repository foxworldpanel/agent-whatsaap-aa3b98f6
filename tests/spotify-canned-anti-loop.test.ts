/**
 * Regressão real: cliente perguntou "O Mind ainda funciona pro
 * Spotify?" e recebeu SPOTIFY_UNAVAILABLE_SAFE_REPLY (canned). Em
 * seguida respondeu com CONTEXTO NOVO ("Eu fazia através do link
 * adicionava saldo e colocava o número de plays desejado") e a Júlia
 * repetiu o mesmo texto canned, palavra por palavra, ignorando o que
 * o cliente disse.
 *
 * Fix: o guard `guardSpotifyUnavailableOffer` deixa a resposta do LLM
 * passar quando a canned já foi entregue no histórico recente, desde
 * que não haja vazamento monetário concreto (R$ + número).
 */
import { describe, it, expect } from "vitest";
import { guardSpotifyUnavailableOffer, SPOTIFY_UNAVAILABLE_SAFE_REPLY } from "@/lib/ai.server";

describe("guardSpotifyUnavailableOffer — anti-loop pós canned", () => {
  const historyWithCanned = [
    { id: "1", sender: "cliente", body: "O Mind ainda funciona pro Spotify?", created_at: new Date().toISOString() },
    { id: "2", sender: "agente", body: SPOTIFY_UNAVAILABLE_SAFE_REPLY, created_at: new Date().toISOString() },
  ] as never;

  it("NÃO repete canned quando cliente traz contexto novo mencionando 'plays'", () => {
    const out = guardSpotifyUnavailableOffer({
      reply:
        "Isso mesmo! Plays direto não tá mais disponível, mas o aluguel de playlist funciona parecido. Quantas músicas você quer divulgar?",
      latestClientMessage: "Eu fazia através do link adicionava saldo e colocava o número de plays desejado",
      history: historyWithCanned,
      servicesContext: null,
    });
    expect(out.replaced).toBe(false);
  });

  it("AINDA bloqueia vazamento monetário concreto mesmo após canned", () => {
    const out = guardSpotifyUnavailableOffer({
      reply: "Beleza, 30.000 plays sai R$ 450.",
      latestClientMessage: "e quanto custa 30000 plays?",
      history: historyWithCanned,
      servicesContext: null,
    });
    expect(out.replaced).toBe(true);
  });
});