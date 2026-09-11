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

const closureMappings = {
  msgId: "input.externalMessageId",
  conversationId: "input.conversationId",
  contactId: "input.contactId",
  contactSource: "input.contactSource",
  phoneStr: "input.phone",
  workspaceId: "input.workspaceId",
  sendTarget: "input.sendTarget",
  instanceUrl: "input.instance.uazapiUrl",
  instanceToken: "input.instance.uazapiToken",
  deferredFunnelMessage: "input.deferredFunnelMessage",
  content: "input.content",
  "num.user_id": "input.userId",
};

const closureHits = Object.fromEntries(
  Object.keys(closureMappings).map((token) => [
    token,
    body.split(token).length - 1,
  ]),
);

const responseReturns = [...body.matchAll(/return new Response\(([^\n]{0,180})/g)].map((m) => m[0]);

const terminalReturnMap = {
  "ok (AI integrations unavailable)": "ai_integrations_unavailable",
  "ok (audio unavailable; flagged for review)": "audio_unavailable",
  "ok (transcription failed; flagged for review)": "audio_transcription_failed",
  "ok (image unavailable; flagged for review)": "image_unavailable",
  "ok (empty content)": "empty_content",
  "ok (critical human escalation)": "critical_human_escalation",
  "ok (critical escalation failed)": "critical_escalation_failed",
  "ok (human handoff)": "human_handoff",
  "ok (human handoff failed)": "human_handoff_failed",
  "ok (stop request)": "stop_request",
  "ok": "completed",
};

const unmappedResponses = responseReturns.filter(
  (line) => !Object.keys(terminalReturnMap).some((label) => line.includes(`\"${label}\"`)),
);
if (unmappedResponses.length > 0) {
  throw new Error(`runtime contains unmapped HTTP terminal returns:\n${unmappedResponses.join("\n")}`);
}

// Safety gate only: no source rewrite happens until every closure and terminal
// path is known. This report is intentionally generated locally and ignored by
// git; it gives the next transform an exact inventory instead of relying on a
// manual edit of the ~100KB webhook.
const report = {
  webhookChars: s.length,
  runtimeBodyChars: body.length,
  start,
  end,
  requiredTokens: required,
  closureMappings,
  closureHits,
  responseReturnCount: responseReturns.length,
  responseReturns,
  terminalReturnMap,
  unmappedResponses,
};
fs.writeFileSync(path.resolve(".stage-b-runtime-extraction.json"), JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));
