import { describe, expect, it } from "vitest";
import fs from "node:fs";

const webhook = fs.readFileSync(
  "src/routes/api/public/hooks/uazapi-webhook.ts",
  "utf8",
);
const orchestrator = fs.readFileSync(
  "src/lib/agent-v3/orchestrator.server.ts",
  "utf8",
);

describe("Hybrid audio reply policy", () => {
  it("não força áudio só porque o cliente mandou áudio", () => {
    expect(webhook).toContain("function shouldReplyWithAudio");
    expect(webhook).toContain('if (params.inputKind !== "audio") return false');
    expect(webhook).toContain("replyMode: replyWithAudio ? \"audio\" : \"texto\"");
  });

  it("usa critérios determinísticos de complexidade", () => {
    expect(webhook).toContain("text.length >= 260");
    expect(webhook).toContain("sentenceCount >= 4");
    expect(webhook).toContain("complexIntent");
    expect(webhook).toContain("hasStepByStepLanguage");
  });

  it("só chama ElevenLabs quando replyWithAudio for verdadeiro", () => {
    expect(webhook).toContain(
      "if (replyWithAudio && elevenlabsApiKey && elevenlabsVoiceId)",
    );
  });

  it("prompt deixa claro que áudio inbound pode receber texto", () => {
    expect(orchestrator).toContain(
      "isso NÃO significa que a resposta também será em áudio",
    );
    expect(orchestrator).toContain(
      "O runtime decide automaticamente se envia texto ou nota de voz",
    );
  });
});
