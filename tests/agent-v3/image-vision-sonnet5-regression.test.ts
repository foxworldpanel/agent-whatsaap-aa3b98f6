import { describe, expect, it } from "vitest";
import fs from "node:fs";

const runtime = fs.readFileSync(
  "src/lib/agent-v3/runtime.server.ts",
  "utf8",
);
const orchestrator = fs.readFileSync(
  "src/lib/agent-v3/orchestrator.server.ts",
  "utf8",
);

describe("Agent V3 image vision", () => {
  it("resolve a mídia real da imagem antes do Claude", () => {
    expect(runtime).toContain("[IMAGE-V3] 1/3 imagem inbound detectada");
    expect(runtime).toContain("uazapiResolveInboundMedia");
    expect(runtime).toContain("resolvedImageSource");
  });

  it("passa a imagem real ao orchestrator", () => {
    expect(runtime).toContain("imageSource: resolvedImageSource");
    expect(orchestrator).toContain("imageSource?:");
  });

  it("usa Sonnet 5 para visão", () => {
    expect(orchestrator).toContain('isImageInput ? "claude-sonnet-5" : "claude-haiku-4-5"');
  });

  it("usa content block image da Anthropic", () => {
    expect(orchestrator).toContain('type: "image"');
    expect(orchestrator).toContain('type: "base64"');
    expect(orchestrator).toContain('type: "url"');
  });

  it("não manda mais o agente negar capacidade visual", () => {
    expect(orchestrator).not.toContain("avise que não consegue ver no momento");
    expect(orchestrator).toContain("Analise a imagem diretamente antes de responder");
  });
});
