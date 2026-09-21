import { describe, expect, it } from "vitest";
import fs from "node:fs";

const runtime = fs.readFileSync("src/lib/agent-v3/runtime.server.ts", "utf8");
const support = fs.readFileSync("src/lib/agent-v3/runtime-support.server.ts", "utf8");
const orchestrator = fs.readFileSync(
  "src/lib/agent-v3/orchestrator.server.ts",
  "utf8",
);

describe("Hybrid audio reply policy", () => {
  it("não força áudio só porque o cliente mandou áudio", () => {
    expect(support).toContain("function shouldReplyWithAudio");
    expect(support).toContain('if (params.inputKind !== "audio") return false');
    expect(runtime).toContain("replyMode: replyWithAudio ? \"audio\" : \"texto\"");
  });

  it("usa critérios determinísticos de complexidade", () => {
    expect(support).toContain("text.length >= 260");
    expect(support).toContain("sentenceCount >= 4");
    expect(support).toContain("complexIntent");
    expect(support).toContain("hasSteps");
  });

  it("só chama ElevenLabs quando replyWithAudio for verdadeiro", () => {
    expect(runtime).toContain(
      "if (replyWithAudio && elevenlabsApiKey && elevenlabsVoiceId)",
    );
  });

  it("prompt deixa claro que áudio inbound pode receber texto", () => {
    const p2 = fs.readFileSync("src/lib/agent-v3/prompt/prompt-p2.server.ts", "utf8");
    expect(p2).toContain("Respostas simples, preços, confirmações e perguntas objetivas devem funcionar bem em texto");
    expect(p2).toContain("O runtime decide automaticamente se envia texto ou nota de voz");
  });
});
