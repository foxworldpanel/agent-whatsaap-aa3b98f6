import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Agent V3 orchestrator anti-loop", () => {
  it("does not bypass the CMS with a hardcoded panel response", () => {
    const file = fs.readFileSync(
      path.resolve(process.cwd(), "src/lib/agent-v3/orchestrator.server.ts"),
      "utf8",
    );

    expect(file).not.toContain("Pra finalizar rapidinho seu pedido");
    expect(file).not.toContain("GLOBAL_V3_CONFIG.panel_url");
    expect(file).toContain("ANTI-LOOP:");
    expect(file).toContain("use somente os módulos carregados");
  });
});
