import {readFileSync} from "node:fs";import{describe,expect,it}from"vitest";
const sql=readFileSync("supabase/migrations/20260914364500_welcome_funnel_legacy_claim_baseline.sql","utf8");
describe("Welcome Funnel legacy claim baseline",()=>{
 it("snapshots only old pre-durable legacy claims without calling them completed",()=>{expect(sql).toContain("welcome_funnel_legacy_claim_baseline");expect(sql).toContain("SELECT r.funnel_id,r.contact_id");expect(sql).toContain("FROM public.welcome_funnel_runs r");expect(sql).toContain("r.fired_at < now() - interval '20 minutes'");expect(sql).toContain("NOT EXISTS(");expect(sql).toContain("FROM public.welcome_funnel_execution_state s");expect(sql).not.toContain("status='completed'");});
 it("keeps the compatibility marker service-role only",()=>{expect(sql).toContain("ENABLE ROW LEVEL SECURITY");expect(sql).toContain("REVOKE ALL ON TABLE public.welcome_funnel_legacy_claim_baseline FROM PUBLIC,anon,authenticated");});
});
