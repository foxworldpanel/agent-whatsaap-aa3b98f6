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
});
