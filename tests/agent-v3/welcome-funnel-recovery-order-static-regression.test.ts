import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const source=readFileSync("src/routes/api/public/hooks/agent-inbound-recovery.ts","utf8");
describe("Welcome Funnel recovery ordering",()=>{
 it("lets generation-lock recovery decide stale ownership before Funnel quarantine",()=>{const lock=source.indexOf("await recoverStaleAgentConversationLocks");const funnel=source.indexOf('"recover_stale_welcome_funnel_executions"');expect(lock).toBeGreaterThan(-1);expect(funnel).toBeGreaterThan(lock);});
 it("keeps both recovery horizons on the canonical conversation lease",()=>{expect(source).toContain("GENERATION_LOCK_STALE_MS = DB_CONVERSATION_LOCK_STALE_MS");expect(source).toContain("WELCOME_FUNNEL_STALE_MS = DB_CONVERSATION_LOCK_STALE_MS");});
});
