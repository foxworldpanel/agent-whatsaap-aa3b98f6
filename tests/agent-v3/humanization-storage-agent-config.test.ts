import { describe, expect, it } from "vitest";
import fs from "node:fs";

const admin = fs.readFileSync(
  "src/lib/agent-v3/admin/humanization.functions.ts",
  "utf8",
);
const webhook = fs.readFileSync(
  "src/routes/api/public/hooks/uazapi-webhook.ts",
  "utf8",
);
const playground = fs.readFileSync(
  "src/lib/agent-v3/admin/playground.functions.ts",
  "utf8",
);

describe("Humanization storage uses existing agent_config", () => {
  it("não depende mais da tabela agent_humanization_settings", () => {
    expect(admin).not.toContain('.from("agent_humanization_settings")');
    expect(webhook).not.toContain('.from("agent_humanization_settings")');
    expect(playground).not.toContain('.from("agent_humanization_settings")');
  });

  it("salva settings dentro de agent_config.modules", () => {
    expect(admin).toContain('HUMANIZATION_CONFIG_KEY = "__humanization_settings"');
    expect(admin).toContain('.from("agent_config")');
    expect(admin).toContain("modules: mergedModules");
  });

  it("mantém campos antigos de atraso sincronizados", () => {
    expect(admin).toContain("response_delay_min_sec");
    expect(admin).toContain("response_delay_max_sec");
    expect(admin).toContain("typing_indicator_enabled");
  });
});
