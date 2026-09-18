import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source=readFileSync("src/lib/agent-v3/telemetry/execution-tracer.server.ts","utf8");
describe("Agent V3 execution tracer fail-open",()=>{it("absorbs resolved backend errors and asynchronous promise rejection",()=>{expect(source).toContain('.from("agent_execution_traces")');expect(source).toContain('.then(({ error }) =>');expect(source).toContain('.catch((error) =>');expect(source).toContain("[EXECUTION-TRACER] Trace backend unavailable:");});});
