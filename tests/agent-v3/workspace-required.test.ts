import { describe, expect, it } from "vitest";
import { getConversationStateV3 } from "@/lib/agent-v3/memory/conversation-state.server";
import { runAgentV3Turn } from "@/lib/agent-v3/orchestrator.server";

describe("Agent V3 workspace isolation", () => {
  it("recusa memória sem workspace em vez de cair no workspace Mind", async () => {
    await expect(
      getConversationStateV3("user-test", "11999999999", undefined),
    ).rejects.toThrow(/workspaceId é obrigatório/i);
  });

  it("recusa execução sem workspace em vez de carregar módulos de outro tenant", async () => {
    await expect(
      runAgentV3Turn({
        userId: "user-test",
        message: "Olá",
        history: [],
        anthropicApiKey: "test-key",
      }),
    ).rejects.toThrow(/workspaceId é obrigatório/i);
  });
});
