import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/lib/agent-v3/conversation-lock.server.ts"),
  "utf8",
);

describe("Agent V3 generation-lock transport uncertainty", () => {
  it("reads durable ownership after an uncertain acquire response", () => {
    expect(source).toContain("if (!error) return data === true");
    expect(source).toContain("current?.holder === holder");
    expect(source).toContain("current && current.holder !== holder");
    expect(source).toContain("throw error");
  });

  it("reads durable ownership after an uncertain release response", () => {
    expect(source).toContain("if (!error && data === true) return true");
    expect(source).toContain("if (!current) return true");
    expect(source).toContain("if (current.holder !== holder) return true");
    expect(source).toContain("return false");
  });
});
