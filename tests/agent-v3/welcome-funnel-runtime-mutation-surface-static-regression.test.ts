import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const runner=readFileSync("src/lib/welcome-funnel-runner.server.ts","utf8");
const control=readFileSync("src/lib/funnel-control.functions.ts","utf8");
describe("Welcome Funnel application mutation surface",()=>{
 it("runner mutates durable execution only through exact-holder RPCs",()=>{expect(runner).toContain('rpc("start_welcome_funnel_execution"');expect(runner).toContain('rpc("mutate_welcome_funnel_execution"');for(const op of [".insert",".update",".delete",".upsert"])expect(runner).not.toContain(`.from("welcome_funnel_execution_state")${op}`);});
 it("control center remains inspection-only and fail-closed",()=>{expect(control).toContain('.from("welcome_funnel_execution_state")');expect(control).toContain("unsupportedControlAction");expect(control).not.toContain("runWelcomeFunnelSequence");for(const op of [".insert",".update",".delete",".upsert"])expect(control).not.toContain(`.from("welcome_funnel_execution_state")${op}`);});
});
