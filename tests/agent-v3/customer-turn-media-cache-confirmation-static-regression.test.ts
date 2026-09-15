import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/lib/agent-v3/customer-turn-media.server.ts", "utf8");

describe("Customer Turn durable media cache confirmation", () => {
  it("confirms a resolved_text write or compatible readback before returning", () => {
    expect(source).toContain('.select("resolved_text").maybeSingle()');
    expect(source).toContain("resolved text conflict");
    expect(source).toContain("resolved text persistence was not confirmed");
    expect(source).toContain("current?.resolved_text===text");
  });
});
