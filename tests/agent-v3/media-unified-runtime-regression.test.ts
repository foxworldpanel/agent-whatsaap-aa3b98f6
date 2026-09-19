import { describe, expect, it } from "vitest";
import fs from "node:fs";

const runtime = fs.readFileSync("src/lib/agent-v3/runtime.server.ts", "utf8");
const uazapi = fs.readFileSync("src/lib/uazapi.server.ts", "utf8");
const orchestrator = fs.readFileSync("src/lib/agent-v3/orchestrator.server.ts", "utf8");

describe("Unified inbound media runtime", () => {
  it("usa o mesmo resolver Uazapi para áudio e imagem", () => {
    expect(uazapi).toContain("uazapiResolveInboundMedia");
    expect(runtime).toContain('mediaKind: "audio"');
    expect(runtime).toContain('mediaKind: "image"');
  });

  it("recupera mídia real via message/find quando necessário", () => {
    expect(uazapi).toContain('/message/find');
    expect(uazapi).toContain("realMessageId");
  });

  it("áudio segue para Whisper", () => {
    expect(runtime).toContain("downloaded.transcription");
    expect(runtime).toContain("processAudioV3");
  });

  it("imagem real segue ao Claude", () => {
    expect(runtime).toContain("imageSource: resolvedImageSource");
    expect(orchestrator).toContain('type: "image"');
    expect(orchestrator).toContain('"claude-sonnet-5"');
  });

  it("não existe mais a falsa resposta de incapacidade visual", () => {
    expect(orchestrator).not.toContain("não consegue ver no momento");
  });
});
