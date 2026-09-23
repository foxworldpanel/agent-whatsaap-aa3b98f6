import { describe, expect, it } from "vitest";
import {
  enforceReengagementGreeting,
  humanizePunctuation,
  isReengagementGreeting,
} from "@/lib/ai.server";
import { autoSplitLongParts } from "@/lib/message-splitter";
import { buildSharedRules, DEFAULT_IDENTITY } from "@/lib/agent-identity.server";

describe("Legacy conversation helpers after Agent V3 CMS cutover", () => {
  it("does not rebuild commercial rules through legacy identity", () => {
    expect(buildSharedRules(DEFAULT_IDENTITY)).toBe("");
  });

  it("keeps deterministic punctuation and split helpers stable", () => {
    expect(humanizePunctuation("Show — vamos combinar assim.")).not.toContain("—");
    expect(autoSplitLongParts("Oi! Como posso te ajudar hoje?")).toHaveLength(1);
  });

  it("does not classify greeting + real question burst as pure reengagement", () => {
    const now = Date.now();
    const history = [
      { sender: "agente" as const, body: "Como posso ajudar?", created_at: new Date(now - 48 * 3600_000).toISOString() },
      { sender: "cliente" as const, body: "Boa noite", created_at: new Date(now - 120_000).toISOString() },
      { sender: "cliente" as const, body: "Poderia me passar informações?", created_at: new Date(now - 60_000).toISOString() },
    ];
    expect(isReengagementGreeting(history)).toBe(false);
  });

  it("mirrors a missing reengagement greeting deterministically", () => {
    expect(enforceReengagementGreeting("Como posso ajudar?", "Boa tarde").text).toMatch(/^Boa tarde!/);
  });
});
