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
  instanceToken: "input.instance.uazapiToken",
  deferredFunnelMessage: "input.deferredFunnelMessage",
  content: "input.content",
  "num.user_id": "input.userId",
  "num.uazapi_url": "input.instance.uazapiUrl",
};

const closureHits = Object.fromEntries(
  Object.keys(closureMappings).map((token) => [token, body.split(token).length - 1]),
);

const responseReturns = [...body.matchAll(/return new Response\(([^\n]{0,180})/g)].map((m) => m[0]);

// Exact current webhook terminals. Dynamic smart-router success is matched by
// prefix because the reason is interpolated into the old HTTP response text.
const terminalPatterns = [
  { pattern: /return new Response\("ok \(AI integrations unavailable\)"\)/, reason: "ai_integrations_unavailable" },
  { pattern: /return new Response\("ok \(audio unavailable; flagged for review\)"\)/, reason: "audio_unavailable" },
  { pattern: /return new Response\("ok \(audio transcription failed; flagged for review\)"\)/, reason: "audio_transcription_failed" },
  { pattern: /return new Response\("ok \(image unavailable; flagged for review\)"\)/, reason: "image_unavailable" },
  { pattern: /return new Response\("ok \(empty content\)"\)/, reason: "empty_content" },
  { pattern: /return new Response\("ok \(critical human escalation\)"\)/, reason: "critical_human_escalation" },
  { pattern: /return new Response\("ok \(critical escalation failed\)"\)/, reason: "critical_escalation_failed" },
  { pattern: /return new Response\("ok \(human handoff\)"\)/, reason: "human_handoff" },
  { pattern: /return new Response\("ok \(human handoff failed\)"\)/, reason: "human_handoff_failed" },
  { pattern: /return new Response\("ok \(stop request persisted\)"\)/, reason: "stop_request" },
  { pattern: /return new Response\("ok \(natural conversational silence\)"\)/, reason: "natural_conversational_silence" },
  { pattern: /return new Response\(`ok \(smart router — \$\{execResult\.routerReason\}\)`\)/, reason: "smart_router_completed" },
  { pattern: /return new Response\("erro \(smart router — falha no envio\)"/, reason: "smart_router_send_failed" },
  { pattern: /return new Response\("ok \(AI processed\)"\)/, reason: "ai_processed" },
  { pattern: /return new Response\("ok \(AI error flagged for review\)"\)/, reason: "ai_error_needs_review" },
  { pattern: /return new Response\("ok"\)/, reason: "completed" },
];

const classifiedResponses = responseReturns.map((line) => ({
  line,
  reason: terminalPatterns.find(({ pattern }) => pattern.test(line))?.reason ?? null,
}));
const unmappedResponses = classifiedResponses.filter((item) => !item.reason).map((item) => item.line);
if (unmappedResponses.length > 0) {
  throw new Error(`runtime contains unmapped HTTP terminal returns:\n${unmappedResponses.join("\n")}`);
}

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
  classifiedResponses,
  unmappedResponses,
};
fs.writeFileSync(path.resolve(".stage-b-runtime-extraction.json"), JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));
