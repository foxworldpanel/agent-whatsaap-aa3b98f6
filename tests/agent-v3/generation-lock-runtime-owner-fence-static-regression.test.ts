import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const acquire=readFileSync("supabase/migrations/20260914460000_generation_lock_acquire_welcome_funnel_fence.sql","utf8");
const privileges=readFileSync("supabase/migrations/20260914481500_generation_lock_final_privilege_fence.sql","utf8");
describe("generation lock acquisition no concurrent runtime overlap",()=>{
 it("serializes acquisition and checks all durable runtime owners before first insert and stale replacement",()=>{
  expect(acquire).toContain("pg_advisory_xact_lock(hashtextextended(p_conversation_id::text,31))");
  const first=acquire.indexOf("IF NOT FOUND THEN");const firstInsert=acquire.indexOf("INSERT INTO public.agent_generation_locks",first);
  const stale=acquire.indexOf("IF v_acquired_at>=p_stale_before");const staleDelete=acquire.indexOf("DELETE FROM public.agent_generation_locks",stale);
  for(const needle of ["j.status IN ('processing_safe','processing')","t.state IN ('processing_safe','processing')","f.status='running'"]){expect(acquire.indexOf(needle,first)).toBeLessThan(firstInsert);expect(acquire.indexOf(needle,stale)).toBeLessThan(staleDelete);}
 });
 it("keeps generation lock mutation behind canonical RPCs",()=>{expect(privileges).toContain("REVOKE INSERT,UPDATE,DELETE ON public.agent_generation_locks FROM service_role");expect(privileges).toContain("GRANT SELECT ON public.agent_generation_locks TO service_role");});
});
