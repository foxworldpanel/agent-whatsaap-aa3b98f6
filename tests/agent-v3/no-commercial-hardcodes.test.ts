import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

function collectTsFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectTsFiles(full);
    return entry.isFile() && /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe("Agent V3 source-of-truth", () => {
  it("does not embed Mind panel URLs or commercial canned replies in V3 runtime code", () => {
    const root = path.resolve(process.cwd(), "src/lib/agent-v3");
    const source = collectTsFiles(root)
      .map((file) => fs.readFileSync(file, "utf8"))
      .join("\n");

    expect(source.toLowerCase()).not.toContain("mindsmmpanel.com");
    expect(source).not.toContain("VERBOSE_LOOP_FAREWELL");
    expect(source).not.toContain("GLOBAL_V3_CONFIG");
  });
});
