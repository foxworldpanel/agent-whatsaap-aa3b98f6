import { describe, expect, it } from "vitest";
import fs from "node:fs";

describe("Agent V3 persistent conversation lock", () => {
  it("usa agent_generation_locks antes de executar o turno", () => {
    const source = fs.readFileSync("src/routes/api/public/hooks/uazapi-webhook.ts", "utf8");
    expect(source).toContain('.from("agent_generation_locks")');
    expect(source).toContain("acquireConversationDbLock");
    expect(source).toContain("releaseConversationDbLock");
    expect(source).toContain("finally");
  });
  it("não considera um turno saudável como lock órfão após poucos segundos", () => {
    const source = fs.readFileSync("src/routes/api/public/hooks/uazapi-webhook.ts", "utf8");
    expect(source).toContain(
      "const DB_CONVERSATION_LOCK_STALE_MS = 5 * 60 * 1000;",
    );
    expect(source).not.toContain(
      "const DB_CONVERSATION_LOCK_STALE_MS = 20 * 1000;",
    );
  });
});
