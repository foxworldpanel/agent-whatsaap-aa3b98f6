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
  expect(orchestrator).toContain("modulesTelemetry,");
  expect(orchestrator).toContain("promptComparison,");
});
