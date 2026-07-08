import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Webhook — agente desligado bloqueia também thread de disparo", () => {
  const src = readFileSync(
    join(process.cwd(), "src/routes/api/public/hooks/uazapi-webhook.ts"),
    "utf8",
  );

  it("não religa a conversa automaticamente quando o lead responde a disparo", () => {
    expect(src).not.toMatch(/update\(\{\s*agent_enabled:\s*true,\s*needs_review:\s*false,\s*review_reason:\s*null\s*\}\)/);
  });

  it("não usa isBlastThread para furar o guard de resposta automática", () => {
    expect(src).not.toMatch(/if\s*\(\s*isTestNumber\s*\|\|\s*isBlastThread\s*\)\s*return\s+true/);
    expect(src).not.toMatch(/&&\s*!isBlastThread\)/);
  });
});