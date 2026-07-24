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
    expect(contactArea).not.toContain("onConflict");
    expect(contactArea).toContain('.eq("user_id", num.user_id)');
    expect(contactArea).toContain('.eq("contact_id", contactId)');
    expect(contactArea).toContain('insertConvErr.code === "23505"');
  });

  it("novas conversas entram com agente ligado explicitamente", () => {
    expect(source).toContain("agent_enabled: true");
  });

  it("integrações de IA são isoladas por workspace", () => {
    const start = source.indexOf('.from("integrations")');
    const block = source.slice(start, start + 700);
    expect(block).toContain('.eq("user_id", num.user_id)');
    expect(block).toContain('.eq("workspace_id", workspaceId)');
  });
});
