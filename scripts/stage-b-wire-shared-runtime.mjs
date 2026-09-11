import fs from "node:fs";
import path from "node:path";

const webhookPath = path.resolve("src/routes/api/public/hooks/uazapi-webhook.ts");
const runtimePath = path.resolve("src/lib/agent-v3/runtime.server.ts");

if (!fs.existsSync(runtimePath)) throw new Error("shared runtime missing; pull the extraction commit first");

const original = fs.readFileSync(webhookPath, "utf8").replace(/\r\n/g, "\n");
const importAnchor = `import {\n  beginWebhookAgentInboundRuntime,\n  finishWebhookAgentInboundRuntime,\n} from "@/lib/agent-v3/inbound-webhook-ownership.server";\n`;
const runtimeImport = `import { executeAgentV3Runtime } from "@/lib/agent-v3/runtime.server";\n`;
if (!original.includes(importAnchor)) throw new Error("webhook ownership import anchor changed");
if (original.includes(runtimeImport)) throw new Error("webhook already imports shared runtime");

const startAnchor = "      let runtimeNeedsReview = false;\n      let runtimeFailure: string | null = null;\n      try {\n";
const endAnchor = "      } finally {\n        // A mesma fronteira terminal usada pelo dispatcher resolve o job antes";
const start = original.indexOf(startAnchor);
const end = original.indexOf(endAnchor, start);
if (start < 0 || end < 0 || end <= start) throw new Error(`effectful runtime anchors changed (start=${start}, end=${end})`);
if (original.indexOf(startAnchor, start + 1) >= 0 || original.indexOf(endAnchor, end + 1) >= 0) {
  throw new Error("runtime anchors are not unique");
}

const body = original.slice(start + startAnchor.length, end);
if (body.length < 50000) throw new Error(`embedded runtime unexpectedly small: ${body.length}`);

const inputBlock = `          const runtimeResult = await executeAgentV3Runtime(supabaseAdmin, {\n            jobId: runtimeOwnership.jobId,\n            conversationId,\n            workspaceId,\n            userId: num.user_id,\n            whatsappNumberId: num.id,\n            contactId,\n            contactSource,\n            phone: phoneStr,\n            externalMessageId: msgId,\n            sendTarget,\n            content: { ...content },\n            deferredFunnelMessage,\n            instance: {\n              uazapiUrl: num.uazapi_url ?? "",\n              uazapiToken: instanceToken,\n            },\n          });\n\n          if (runtimeResult.class === "operational_attention") {\n            console.warn("[AGENT-INBOUND] runtime terminou com atenção operacional", {\n              jobId: runtimeOwnership.jobId,\n              reason: runtimeResult.reason,\n            });\n          }\n\n          return new Response("ok (agent runtime — " + runtimeResult.reason + ")");\n`;

let next = original.slice(0, start + startAnchor.length) + inputBlock + original.slice(end);
next = next.replace(importAnchor, importAnchor + runtimeImport);

if (next.includes(body)) throw new Error("embedded runtime body still present after transformation");
if (!next.includes("executeAgentV3Runtime(supabaseAdmin")) throw new Error("shared runtime call missing after transformation");
if (next.length > original.length - 45000) throw new Error("webhook did not shrink enough; refusing write");

const tempPath = `${webhookPath}.stage-b-next`;
fs.writeFileSync(tempPath, next, "utf8");
fs.renameSync(tempPath, webhookPath);
console.log(JSON.stringify({ beforeChars: original.length, afterChars: next.length, removedChars: original.length - next.length }, null, 2));
