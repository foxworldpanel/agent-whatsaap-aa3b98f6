import { describe, expect, it } from "vitest";
import fs from "node:fs";

const source = fs.readFileSync(
  "src/routes/api/public/hooks/uazapi-webhook.ts",
  "utf8",
);

describe("Webhook runtime DB compatibility", () => {
  it("não depende de onConflict para criar/atualizar conversations", () => {
    const contactArea = source.slice(
      source.indexOf("// Resolve Conversation"),
      source.indexOf("// Insert Message"),
    );
    expect(contactArea).not.toMatch(/\.upsert\([\s\S]*onConflict/);
    expect(contactArea).toContain('.eq("user_id", num.user_id)');
    expect(contactArea).toContain('.eq("contact_id", contactId)');
    expect(contactArea).toContain('insertConvErr.code === "23505"');
  });

  it("novas conversas entram com agente ligado explicitamente", () => {
    expect(source).toContain("agent_enabled: true");
  });

  it("gates do Agent são isolados por workspace", () => {
    const start = source.indexOf('.from("agent_config")');
    const block = source.slice(start, start + 500);
    expect(start).toBeGreaterThan(-1);
    expect(block).toContain('.eq("user_id", num.user_id)');
    expect(block).toContain('.eq("workspace_id", workspaceId)');
  });
});
