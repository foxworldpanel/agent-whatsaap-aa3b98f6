import{readFileSync}from"node:fs";import{describe,expect,it}from"vitest";
const sql=readFileSync("supabase/migrations/20260914504500_welcome_funnel_db_barrier_workspace_identity.sql","utf8");
describe("Welcome Funnel DB barrier workspace identity",()=>{
 it("fences Customer Turn runtime on workspace mismatch",()=>{expect(sql).toContain("s.workspace_id IS DISTINCT FROM NEW.workspace_id");expect(sql).toContain("Agent Customer Turn blocked by durable Welcome Funnel barrier or routing identity mismatch");});
 it("fences Stage B runtime on workspace mismatch",()=>{expect(sql).toContain("Agent Stage B runtime blocked by durable Welcome Funnel barrier or routing identity mismatch");});
 it("fences attachment against the durable Stage B workspace",()=>{expect(sql).toContain("j.workspace_id");expect(sql).toContain("s.workspace_id IS DISTINCT FROM v_workspace_id");});
 it("keeps the canonical seed-31 advisory namespace",()=>{expect((sql.match(/hashtextextended\([^\n]+,31\)/g)||[]).length).toBeGreaterThanOrEqual(3);});
});
