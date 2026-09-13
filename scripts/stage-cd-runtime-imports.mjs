import fs from "node:fs";
const p = "C:/mind-agent-v3-stage-b/src/lib/agent-v3/runtime.server.ts";
let s = fs.readFileSync(p,"utf8");
const a='import { runtimeTerminal } from "@/lib/agent-v3/inbound-runtime-result.server";';
if(!s.includes(a)) throw new Error("anchor missing");
if(!s.includes('runtime-support.server')) s=s.replace(a,a+'\nimport { detectCriticalHumanEscalation, isHumanHandoffRequest, isStopRequest, shouldReplyWithAudio, traceFunnel } from "@/lib/agent-v3/runtime-support.server";');
fs.writeFileSync(p,s,"utf8");
console.log("STAGE_CD_RUNTIME_IMPORTS_OK");