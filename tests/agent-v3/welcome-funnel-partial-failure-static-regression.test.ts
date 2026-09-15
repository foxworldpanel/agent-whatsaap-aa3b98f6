import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const source=readFileSync(resolve(process.cwd(),"src/lib/welcome-funnel-runner.server.ts"),"utf8");
describe("Welcome Funnel partial failure semantics",()=>{
 it("never reports completed after any failed delivery/persistence step",()=>{expect(source).toContain("const failures:");expect(source).toContain("if(failures.length)");expect(source).toContain("manual review required");expect(source.indexOf("if(failures.length)")).toBeLessThan(source.indexOf('step:"sequence_completed"'));});
 it("treats outbound persistence failure as delivery uncertainty",()=>{expect(source).toContain("outbound sent but persistence failed");expect(source).toContain("throw new Error");});
 it("persists durable review before throwing a known partial failure",()=>{expect(source).toContain("await markExecutionNeedsReview");expect(source.indexOf("await markExecutionNeedsReview")).toBeLessThan(source.indexOf("manual review required"));});
 it("persists authoritative completion before best-effort CRM enrichment",()=>{expect(source).toContain("await markExecutionCompleted");expect(source.indexOf("await markExecutionCompleted")).toBeLessThan(source.indexOf('update({funnel_status:"completed"})'));expect(source).toContain("falha apenas ao enriquecer funnel_status");});
});
