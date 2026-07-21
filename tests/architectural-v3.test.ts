import { describe, it, expect } from "vitest";
import { selectRelevantModules, buildPromptFromModules } from "@/lib/agent-v3/module-selector.server";
import { DEFAULT_MODULES_V3 } from "@/lib/agent-v3/default-modules-v3.server";

describe("Agent V3 Architectural Logic", () => {
  it("should always include CORE_MODULES even if not requested", () => {
    const selected = selectRelevantModules("oi", []);
    expect(selected).toContain("identidade");
    expect(selected).toContain("regras_gerais");
    expect(selected).toContain("comportamento_humano");
  });

  it("should respect enabledModules filter for non-core modules", () => {
    // 'plays' triggers spotify, but we don't enable it
    const selected = selectRelevantModules("quero plays", ["fluxo_vendas"]);
    expect(selected).not.toContain("spotify");
    expect(selected).toContain("fluxo_vendas");
  });

  it("should use custom content when provided to buildPromptFromModules", () => {
    const keys = ["identidade"];
    const custom = { identidade: "Sou uma persona customizada" };
    const prompt = buildPromptFromModules(keys, custom);
    expect(prompt).toBe("Sou uma persona customizada");
  });

  it("should fallback to DEFAULT_MODULES_V3 when custom content is missing", () => {
    const keys = ["identidade"];
    const prompt = buildPromptFromModules(keys, {});
    expect(prompt).toBe(DEFAULT_MODULES_V3.identidade);
  });
});
