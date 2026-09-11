import fs from "node:fs";
import path from "node:path";

const webhookPath = path.resolve("src/routes/api/public/hooks/uazapi-webhook.ts");
const runtimePath = path.resolve("src/lib/agent-v3/runtime.server.ts");
const webhook = fs.readFileSync(webhookPath, "utf8");

const startAnchor = "      let runtimeNeedsReview = false;\n      let runtimeFailure: string | null = null;\n      try {\n";
const catchAnchor = "      } catch (e: any) {\n";
const endAnchor = "      } finally {\n        // A mesma fronteira terminal usada pelo dispatcher resolve o job antes";
const start = webhook.indexOf(startAnchor);
const catchStart = webhook.indexOf(catchAnchor, start);
const end = webhook.indexOf(endAnchor, start);
if (start < 0 || catchStart < 0 || end < 0 || catchStart <= start || end <= catchStart) {
  throw new Error("runtime anchors changed; refusing draft generation");
}
const body = webhook.slice(start + startAnchor.length, catchStart);
if (body.length < 45000) throw new Error(`runtime body unexpectedly small: ${body.length}`);

const replacements = [
  [/return new Response\("ok \(AI integrations unavailable\)"\);/g, 'return runtimeTerminal("ai_integrations_unavailable");'],
  [/return new Response\("ok \(audio unavailable; flagged for review\)"\);/g, 'return runtimeTerminal("audio_unavailable");'],
  [/return new Response\("ok \(audio transcription failed; flagged for review\)"\);/g, 'return runtimeTerminal("audio_transcription_failed");'],
  [/return new Response\("ok \(image unavailable; flagged for review\)"\);/g, 'return runtimeTerminal("image_unavailable");'],
  [/return new Response\("ok \(empty content\)"\);/g, 'return runtimeTerminal("empty_content");'],
  [/return new Response\("ok \(critical human escalation\)"\);/g, 'return runtimeTerminal("critical_human_escalation");'],
  [/return new Response\("ok \(critical escalation failed\)"\);/g, 'return runtimeTerminal("critical_escalation_failed");'],
  [/return new Response\("ok \(human handoff\)"\);/g, 'return runtimeTerminal("human_handoff");'],
  [/return new Response\("ok \(human handoff failed\)"\);/g, 'return runtimeTerminal("human_handoff_failed");'],
  [/return new Response\("ok \(stop request persisted\)"\);/g, 'return runtimeTerminal("stop_request");'],
  [/return new Response\("ok \(natural conversational silence\)"\);/g, 'return runtimeTerminal("natural_conversational_silence");'],
  [/return new Response\(`ok \(smart router — \$\{execResult\.routerReason\}\)`\);/g, 'return runtimeTerminal("smart_router_completed");'],
  [/return new Response\("erro \(smart router — falha no envio\)", \{ status: 500 \}\);/g, 'return runtimeTerminal("smart_router_send_failed");'],
  [/return new Response\("ok \(AI processed\)"\);/g, 'return runtimeTerminal("ai_processed");'],
];
let transformed = body;
for (const [pattern, replacement] of replacements) transformed = transformed.replace(pattern, replacement);
if (/return new Response\(/.test(transformed)) throw new Error("unconverted HTTP return remains in runtime draft");

const aliases = `  const msgId = input.externalMessageId;\n  const conversationId = input.conversationId;\n  const contactId = input.contactId;\n  const contactSource = input.contactSource;\n  const phoneStr = input.phone;\n  const workspaceId = input.workspaceId;\n  const sendTarget = input.sendTarget;\n  const instanceToken = input.instance.uazapiToken;\n  const deferredFunnelMessage = input.deferredFunnelMessage;\n  const content = { ...input.content };\n  const num = {\n    id: input.whatsappNumberId,\n    user_id: input.userId,\n    workspace_id: input.workspaceId,\n    uazapi_url: input.instance.uazapiUrl,\n  };\n  const inboundStartedAt = Date.now();\n  const traceId = generateTraceId();\n`;

const header = `import { sendAgentTextGuarded } from "@/lib/send-agent-guarded.server";\nimport { generateTraceId, logExecutionTrace } from "@/lib/agent-v3/telemetry/execution-tracer.server";\nimport type { AgentV3RuntimeExecutor } from "@/lib/agent-v3/inbound-runtime-contract.server";\nimport { runtimeTerminal } from "@/lib/agent-v3/inbound-runtime-result.server";\n\n// Generated from the audited effectful webhook boundary. The webhook owns the\n// outer catch/finally so durable ownership is finalized in one place.\nexport const executeAgentV3Runtime: AgentV3RuntimeExecutor = async (supabaseAdmin, input) => {\n${aliases}\n`;
const footer = `\n  return runtimeTerminal("completed");\n};\n`;
const output = header + transformed + footer;
fs.writeFileSync(runtimePath, output, "utf8");
console.log(JSON.stringify({ runtimePath, chars: output.length, sourceBodyChars: body.length }, null, 2));
