import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source=readFileSync("src/lib/welcome-funnel-runner.server.ts","utf8");

describe("Welcome Funnel resume and configuration safety",()=>{
 it("rejects unknown resume checkpoints instead of replaying from the beginning",()=>{
  expect(source).toContain("Invalid Welcome Funnel resume checkpoint");
  expect(source).toContain("const resumeIndex=resolveResumeIndex(params.resumeAfterStep)");
 });
 it("records enabled steps with missing payload as failures instead of silently skipping them",()=>{
  expect(source).toContain("Enabled Welcome Funnel step ${key} has empty text");
  expect(source).toContain("Enabled Welcome Funnel step ${key} has empty url");
  expect(source).toContain('step:"step_config_error"');
  expect(source).toContain("configuration:true");
 });
});
