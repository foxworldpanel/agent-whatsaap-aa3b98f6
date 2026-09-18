import { describe, expect, it } from "vitest";
import fs from "node:fs";

const lock = fs.readFileSync("src/lib/agent-v3/conversation-lock.server.ts", "utf8");
const dispatch = fs.readFileSync("src/lib/agent-v3/customer-turn-dispatch.server.ts", "utf8");

describe("Agent V3 persistent conversation lock", () => {
  it("mantém o lock persistente encapsulado no helper canônico", () => {
    expect(lock).toContain('.from("agent_generation_locks")');
    expect(lock).toContain("acquireAgentConversationLock");
    expect(lock).toContain("releaseAgentConversationLock");
    expect(dispatch).not.toContain('.from("agent_generation_locks")');
  });
  it("usa o horizonte canônico de 20 minutos para owner ativo", () => {
    expect(lock).toContain("DB_CONVERSATION_LOCK_STALE_MS = 20 * 60 * 1000");
    expect(lock).not.toContain("DB_CONVERSATION_LOCK_STALE_MS = 20 * 1000");
  });
});
