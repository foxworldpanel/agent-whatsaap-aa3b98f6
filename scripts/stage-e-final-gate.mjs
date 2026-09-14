import { execFileSync } from "node:child_process";
import fs from "node:fs";

const root = "C:/mind-agent-v3-stage-b";
const runNode = (script) => execFileSync(process.execPath, [`${root}/${script}`], { cwd: root, stdio: "inherit" });
const runCmd = (args) => execFileSync("cmd.exe", ["/d", "/s", "/c", args], { cwd: root, stdio: "inherit" });

runNode("scripts/stage-e-conversation-context.mjs");
runNode("scripts/stage-e-outbound-question-guard.mjs");
runNode("scripts/stage-e-behavior-regression.mjs");

const conversation = fs.readFileSync(`${root}/src/lib/agent-v3/core/conversation-engine.server.ts`, "utf8");
const sendGuard = fs.readFileSync(`${root}/src/lib/send-agent-guarded.server.ts`, "utf8");
const required = [
  ["history topic source", conversation.includes('"history" | "none"')],
  ["history topic recovery", conversation.includes("recentHistory = history.slice(-12).reverse()")],
  ["greeting stays done", conversation.includes("const greetingAlreadyDone = agentMessages.length > 0;")],
  ["question repetition guard", sendGuard.includes("function suppressRepeatedQuestion(")],
  ["question history window", sendGuard.includes("Math.max(opts.emojiWindow ?? 3, 6)")],
];
for (const [name, ok] of required) console.log(`${ok ? "OK" : "FAIL"} ${name}`);
const failed = required.filter(([, ok]) => !ok);
if (failed.length) throw new Error(`Stage E final gate failed: ${failed.map(([name]) => name).join(", ")}`);

runCmd("npm.cmd run build");
runCmd("npx.cmd tsc --noEmit");
runCmd("git diff --check");
console.log("STAGE_E_FINAL_GATE_OK");
