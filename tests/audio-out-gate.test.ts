import { describe, it, expect } from "vitest";
import { decideAudioOut, hasStructuredContent, LONG_TEXT_CHARS } from "@/lib/audio-out-gate";

const OK_CFG = { hasElevenLabsKey: true, hasVoiceId: true, clientSentAudio: true };

describe("ETAPA 5 — audio-out gate", () => {
  it("cliente mandou texto → nunca áudio", () => {
    const d = decideAudioOut({ ...OK_CFG, clientSentAudio: false, firstReplyPart: "curto" });
    expect(d.audio).toBe(false);
    expect(d.reason).toBe("no-input-audio");
  });

  it("sem ElevenLabs key/voice → texto (fallback)", () => {
    const d = decideAudioOut({ ...OK_CFG, hasElevenLabsKey: false, firstReplyPart: "oi" });
    expect(d.audio).toBe(false);
    expect(d.reason).toBe("no-tts-config");
  });

  it("resposta vazia → texto", () => {
    const d = decideAudioOut({ ...OK_CFG, firstReplyPart: "" });
    expect(d.audio).toBe(false);
    expect(d.reason).toBe("empty-reply");
  });

  it("resposta curta e conversacional → áudio OK", () => {
    const d = decideAudioOut({ ...OK_CFG, firstReplyPart: "Funciona sim! É gradual e com ouvintes reais." });
    expect(d.audio).toBe(true);
    expect(d.reason).toBe("ok");
  });

  it("resposta com URL → texto", () => {
    const d = decideAudioOut({ ...OK_CFG, firstReplyPart: "Acessa https://mindsmmpanel.com e cadastra rapidinho." });
    expect(d.audio).toBe(false);
    expect(d.reason).toBe("structured-content");
  });

  it("resposta com domínio nu → texto", () => {
    const d = decideAudioOut({ ...OK_CFG, firstReplyPart: "É só entrar em mindsmmpanel.com" });
    expect(d.audio).toBe(false);
    expect(d.reason).toBe("structured-content");
  });

  it("resposta com preço R$ → texto", () => {
    const d = decideAudioOut({ ...OK_CFG, firstReplyPart: "Fica R$15 pra 1000 plays. Fecha?" });
    expect(d.audio).toBe(false);
    expect(d.reason).toBe("structured-content");
  });

  it("tutorial passo a passo numerado → texto (caso real reportado)", () => {
    const tut = "Segue o passo a passo:\n1. Cadastro no painel\n2. Recarga via PIX\n3. Escolher serviço\n4. Colar link\n5. Confirmar pedido";
    const d = decideAudioOut({ ...OK_CFG, firstReplyPart: tut });
    expect(d.audio).toBe(false);
    expect(d.reason).toBe("structured-content");
  });

  it("tutorial inline '1) ... 2) ...' também detecta", () => {
    const tut = "É simples: 1) faz o cadastro 2) deposita via PIX 3) escolhe o serviço 4) cola o link";
    expect(hasStructuredContent(tut)).toBe(true);
  });

  it("resposta longa (>250 chars) conversacional → texto (too-long)", () => {
    const long = "a".repeat(LONG_TEXT_CHARS + 10);
    const d = decideAudioOut({ ...OK_CFG, firstReplyPart: long });
    expect(d.audio).toBe(false);
    expect(d.reason).toBe("too-long");
  });

  it("pergunta simples de confiança → áudio OK", () => {
    const d = decideAudioOut({ ...OK_CFG, firstReplyPart: "Isso funciona sim, pode confiar!" });
    expect(d.audio).toBe(true);
  });

  it("REGRESSÃO REAL — cliente mandou áudio 'quanto custa' → resposta com R$ vai por texto", () => {
    const d = decideAudioOut({ ...OK_CFG, firstReplyPart: "1000 plays sai R$15, 5000 sai R$70. Qual você quer?" });
    expect(d.audio).toBe(false);
    expect(d.reason).toBe("structured-content");
  });
});