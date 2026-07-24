import { describe, expect, it } from "vitest";
import fs from "node:fs";

const server = fs.readFileSync(
  "src/lib/agent-v3/humanization.server.ts",
  "utf8",
);
const admin = fs.readFileSync(
  "src/lib/agent-v3/admin/humanization.functions.ts",
  "utf8",
);
const page = fs.readFileSync(
  "src/routes/_authenticated/agente.tsx",
  "utf8",
);

describe("Humanization configurable limits", () => {
  it("permite resposta de até 120 segundos", () => {
    expect(server).toContain("120_000");
    expect(admin).toContain("max(120000)");
    expect(page).toContain("max={120}");
  });

  it("permite intervalo entre partes de até 30 segundos", () => {
    expect(server).toContain("30_000");
    expect(admin).toContain("max(30000)");
    expect(page).toContain("max={30}");
  });
});
