import { test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const orchestrator = fs.readFileSync(
  path.resolve(process.cwd(), "src/lib/agent-v3/orchestrator.server.ts"),
  "utf8",
);

test("Orchestrator exposes module telemetry and prompt comparison without external integration", () => {
  expect(orchestrator).toContain("const modulesTelemetry: ModuleTelemetry[]");
  expect(orchestrator).toContain("effectiveSelectedKeys.map((key) =>");
  expect(orchestrator).toContain("const promptComparison = {");
  expect(orchestrator).toContain("withoutCommercial: tokensWithout");
  expect(orchestrator).toContain("withCommercial: tokensWith");
  expect(orchestrator).toContain("diff: tokensWith - tokensWithout");

  // A telemetria pública é exposta pelo contrato real de result.modules.
  // Não exigimos propriedades top-level legadas que o orchestrator não retorna.
  expect(orchestrator).toContain("estimated_tokens_by_module: Object.fromEntries(");
  expect(orchestrator).toContain("modulesTelemetry.map((m) => [m.key, m.tokens])");
  expect(orchestrator).toContain("estimated_chars_by_module: Object.fromEntries(");
  expect(orchestrator).toContain("modulesTelemetry.map((m) => [m.key, m.chars])");
  expect(orchestrator).toContain("prompt_tokens_without_commercial: promptComparison.withoutCommercial");
  expect(orchestrator).toContain("prompt_tokens_with_commercial: promptComparison.withCommercial");
  expect(orchestrator).toContain("commercial_tokens_added: promptComparison.diff");
});
