import fs from "node:fs";
import path from "node:path";

const webhookPath = path.resolve("src/routes/api/public/hooks/uazapi-webhook.ts");
let source = fs.readFileSync(webhookPath, "utf8").replace(/\r\n/g, "\n");

const anchor = `          const runtimeResult = await executeAgentV3Runtime(supabaseAdmin, {\n            jobId: runtimeOwnership.jobId,\n            conversationId,\n`;
const replacement = `          const runtimeResult = await executeAgentV3Runtime(supabaseAdmin, {\n            source: "webhook",\n            messageId: persistedMessageId,\n            externalMessageId: msgId,\n            conversationId,\n`;

if (source.includes(`source: "webhook",\n            messageId: persistedMessageId,`)) {
  console.log("runtime webhook identity already complete");
  process.exit(0);
}
if (!source.includes(anchor)) throw new Error("shared runtime input anchor changed; refusing patch");
source = source.replace(anchor, replacement);

// externalMessageId existed later in the generated block; remove that duplicate only.
const duplicate = `            phone: phoneStr,\n            externalMessageId: msgId,\n            sendTarget,`;
if (!source.includes(duplicate)) throw new Error("expected externalMessageId position missing");
source = source.replace(duplicate, `            phone: phoneStr,\n            sendTarget,`);

fs.writeFileSync(webhookPath, source, "utf8");
console.log("STAGE_B_RUNTIME_INPUT_OK");
