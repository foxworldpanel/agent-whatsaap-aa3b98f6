import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe,expect,it } from "vitest";
const sql=readFileSync(resolve(process.cwd(),"supabase/migrations/20260914383000_welcome_funnel_execution_classification.sql"),"utf8");
describe("Welcome Funnel execution classification",()=>{
 it("prefers durable state over legacy evidence",()=>{expect(sql.indexOf("welcome_funnel_execution_state")).toBeLessThan(sql.indexOf("welcome_funnel_legacy_claim_baseline"));});
 it("distinguishes historical compatibility from ambiguous post-baseline claims",()=>{expect(sql).toContain("RETURN 'legacy_compatible'");expect(sql).toContain("RETURN 'legacy_ambiguous'");expect(sql).toContain("RETURN 'unclaimed'");expect(sql).toContain("RETURN 'durable_'||v_status");});
});
