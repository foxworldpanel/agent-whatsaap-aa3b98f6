import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const source=readFileSync("src/lib/agent-v3/conversation-lock.server.ts","utf8");
describe("generation lock application mutation surface",()=>{
 it("uses RPCs for acquire refresh release and recovery",()=>{
  for(const rpc of ["acquire_agent_conversation_lock","refresh_agent_conversation_lock","release_agent_conversation_lock","recover_stale_agent_generation_locks"]) expect(source).toContain(`"${rpc}"`);
 });
 it("uses direct table access only to verify durable ownership",()=>{
  expect(source).toContain('.from("agent_generation_locks")');
  expect(source).toContain('.select("conversation_id,holder")');
  expect(source).not.toContain('.insert(');
  expect(source).not.toContain('.update(');
  expect(source).not.toContain('.delete(');
 });
});
