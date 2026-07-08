// Regressão do caso real +55 33 9869 5136 (cliente com álbum de 12
// músicas perguntando sobre plays).
//
// O guarda `guardSpotifyUnavailableOffer` deve BLOQUEAR só vazamento
// real (quantidade+preço/distribuição de plays/ouvintes/saves) — nunca
// impedir a evolução legítima do funil para aluguel de playlist.
//
// Estas asserções travam o comportamento ANTES de qualquer refatoração
// arquitetural. Se algo aqui virar vermelho, é sinal de regressão.

import { describe, it, expect } from "vitest";
import { guardSpotifyUnavailableOffer, SPOTIFY_UNAVAILABLE_SAFE_REPLY } from "@/lib/ai.server";

describe("Spotify funnel — regressão +55 33 9869 5136", () => {
  it("BLOQUEIA vazamento real: '1000 plays por dia distribuídos entre 12 músicas'", () => {
    const out = guardSpotifyUnavailableOffer({
      reply:
        "Beleza! Fechamos 30.000 plays no total, distribuindo 1000 plays por dia entre as 12 músicas do álbum.",
      latestClientMessage: "quero divulgar meu álbum no spotify",
      history: [],
      servicesContext: null,
    });
    expect(out.replaced).toBe(true);
    expect(out.text).toBe(SPOTIFY_UNAVAILABLE_SAFE_REPLY);
  });

  it("BLOQUEIA vazamento com preço: '30.000 plays por R$ 450'", () => {
    const out = guardSpotifyUnavailableOffer({
      reply: "Fica R$ 450 pra entregar 30.000 plays na sua música no spotify.",
      latestClientMessage: "quanto custa 30000 plays?",
      history: [],
      servicesContext: null,
    });
    expect(out.replaced).toBe(true);
  });

  it("PERMITE resposta minimalista que redireciona pro aluguel de playlist sem palavras neutras", () => {
    const out = guardSpotifyUnavailableOffer({
      reply: "No spotify hoje trabalho com aluguel de playlist. Qual seu estilo musical?",
      latestClientMessage: "e plays no spotify?",
      history: [],
      servicesContext: null,
    });
    // Nota: "trabalho" (verbo, não "trabalhamos") + "estilo" não ativam leak.
    expect(out.replaced).toBe(false);
  });

  // ============================================================
  // FASE 2 TARGETS — travam a meta da refatoração do guarda.
  // Hoje o SPOTIFY_SALES_LEAK_RX é overbroad e sobrescreve com o
  // canned respostas comerciais legítimas que só usam palavras
  // neutras (entrega/reais/ativas). Quando a Fase 2 reescrever
  // o leak-RX, remover .todo e validar verde.
  // ============================================================
  it.todo("[Fase 2] PERMITE resposta consultiva que redireciona ao aluguel usando 'entrega'/'divulgar'");
  it.todo("[Fase 2] PERMITE explicação de aluguel de playlist com 'reais e ativas' sem preço/quantidade");

  it("PERMITE conversa que não menciona Spotify nem termos restritos", () => {
    const out = guardSpotifyUnavailableOffer({
      reply: "Show, posso te ajudar com seguidores no Instagram então!",
      latestClientMessage: "prefiro instagram",
      history: [],
      servicesContext: null,
    });
    expect(out.replaced).toBe(false);
  });

  it("NÃO entra em loop: canned não repete quando a resposta anterior já foi o canned", () => {
    // Simula turno seguinte ao canned: cliente respondeu "12 músicas" e a
    // IA constrói próximo passo consultivo sem vazamento. Guard deve deixar
    // passar — caso contrário o funil trava e o cliente recebe SEMPRE a
    // mesma pergunta "quantas músicas?".
    const out = guardSpotifyUnavailableOffer({
      reply:
        "Perfeito, 12 músicas! Nesse caso o pacote ideal é o Eclética — te mando os detalhes agora?",
      latestClientMessage: "12 músicas",
      history: [
        { id: "1", sender: "cliente", body: "quero divulgar meu album no spotify", created_at: new Date().toISOString() },
        { id: "2", sender: "agente", body: SPOTIFY_UNAVAILABLE_SAFE_REPLY, created_at: new Date().toISOString() },
      ] as never,
      servicesContext: null,
    });
    expect(out.replaced).toBe(false);
  });
});