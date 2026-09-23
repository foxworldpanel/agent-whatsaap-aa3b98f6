import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const source=readFileSync("src/lib/welcome-funnel-runner.server.ts","utf8");
const plan=readFileSync("src/lib/welcome-funnel-plan.ts","utf8");
describe("Welcome Funnel resume and configuration safety",()=>{
 it("rejects unknown and unproven automatic resume checkpoints",()=>{expect(source).toContain("Invalid Welcome Funnel resume checkpoint");expect(source).toContain("Welcome Funnel automatic resume requires a durable resume transition");expect(source).not.toContain('.upsert({funnel_id:params.funnelId');});
 it("validates enabled step payloads in the shared plan and records configuration failures",()=>{expect(plan).toContain("Enabled Welcome Funnel step ${key} has empty text");expect(plan).toContain("Enabled Welcome Funnel step ${key} has empty url");expect(source).toContain("resolveWelcomeFunnelPayloads");expect(source).toContain('step:"step_config_error"');expect(source).toContain("configuration:true");expect(source).toContain("throw configError");});
 it("stops after a send or persistence failure to preserve a contiguous durable prefix",()=>{expect(source).toContain("execução interrompida para preservar um prefixo durável contíguo");});
});
