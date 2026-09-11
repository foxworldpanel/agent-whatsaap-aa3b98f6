import fs from "node:fs";
import path from "node:path";

const webhookPath = path.resolve("src/routes/api/public/hooks/uazapi-webhook.ts");
const runtimePath = path.resolve("src/lib/agent-v3/runtime.server.ts");
const s = fs.readFileSync(webhookPath, "utf8");

if (fs.existsSync(runtimePath)) throw new Error("runtime.server.ts already exists; refusing destructive extraction");

const startAnchor = "      let runtimeNeedsReview = false;\n      let runtimeFailure: string | null = null;\n      try {\n";
const endAnchor = "      } finally {\n        // A mesma fronteira terminal usada pelo dispatcher resolve o job antes";
const start = s.indexOf(startAnchor);
const end = s.indexOf(endAnchor, start);
if (start < 0 || end < 0 || end <= start) throw new Error("runtime extraction anchors not found exactly as expected");
if (s.indexOf(startAnchor, start + 1) >= 0) throw new Error("runtime start anchor is not unique");
if (s.indexOf(endAnchor, end + 1) >= 0) throw new Error("runtime end anchor is not unique");

const body = s.slice(start + startAnchor.length, end);
if (body.length < 50000) throw new Error(`runtime body unexpectedly small (${body.length} chars)`);

const required = [
  "sendAgentTextGuarded",
  "saveConversationStateV3",
  "generateTraceId",
  "logExecutionTrace",
  "replyParts",
];
for (const token of required) {
  if (!body.includes(token)) throw new Error(`runtime body missing required behavior token: ${token}`);
}

// This transform is intentionally a preparation/validation artifact only. The
// extracted body still closes over webhook locals. The next transform maps each
// free variable to AgentV3RuntimeInput before any source file is rewritten.
const report = {
  webhookChars: s.length,
  runtimeBodyChars: body.length,
  start,
  end,
  requiredTokens: required,
};
fs.writeFileSync(path.resolve(".stage-b-runtime-extraction.json"), JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));
