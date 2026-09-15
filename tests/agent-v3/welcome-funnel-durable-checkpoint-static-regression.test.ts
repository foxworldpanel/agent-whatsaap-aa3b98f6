import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source=readFileSync("src/lib/welcome-funnel-runner.server.ts","utf8");

describe("Welcome Funnel durable progress",()=>{
 it("creates running state before any provider send",()=>{
  expect(source.indexOf("await startExecutionState")).toBeLessThan(source.indexOf("await uazapiSendText"));
 });
 it("checkpoints successful side effects outside the send catch",()=>{
  expect(source).toContain("await checkpointExecutionState");
  expect(source).toContain("continuing would create more side effects with unknown replay state");
 });
 it("keeps CRM completion secondary to durable execution truth",()=>{
  expect(source.indexOf("await markExecutionCompleted")).toBeLessThan(source.indexOf('funnel_status:"completed"'));
 });
});
