import{readFileSync}from"node:fs";import{describe,expect,it}from"vitest";
const src=readFileSync("src/lib/welcome-funnel-conversation-barrier.server.ts","utf8");
describe("Welcome Funnel conversation barrier helper",()=>{it("fails closed on running/review/identity mismatch and unknown states",()=>{expect(src).toContain('"running"|"needs_review"|"identity_mismatch"|"clear"');expect(src).toContain('state!=="clear"');expect(src).toContain("Unknown Welcome Funnel conversation barrier");});});
