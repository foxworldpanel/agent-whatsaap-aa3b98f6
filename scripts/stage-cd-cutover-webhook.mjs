import fs from "node:fs";

const root = "C:\\mind-agent-v3-stage-b";
const path = `${root}\\src\\routes\\api\\public\\hooks\\uazapi-webhook.ts`;
const lf = (value) => value.replace(/\r\n/g, "\n");

function replaceUnique(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${label}: anchor not found`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`${label}: anchor not unique`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

let source = lf(fs.readFileSync(path, "utf8"));

source = replaceUnique(
  source,
  `import {\n  beginWebhookAgentInboundRuntime,\n  finishWebhookAgentInboundRuntime,\n} from "@/lib/agent-v3/inbound-webhook-ownership.server";\nimport { executeAgentV3Runtime } from "@/lib/agent-v3/runtime.server";`,
  `import { beginWebhookAgentInboundRuntime } from "@/lib/agent-v3/inbound-webhook-ownership.server";\nimport { AGENT_CUSTOMER_TURN_QUIET_MS } from "@/lib/agent-v3/customer-turn.server";\nimport { dispatchReadyCustomerTurnById } from "@/lib/agent-v3/customer-turn-dispatch.server";`,
  "legacy runtime imports",
);

const debounceStart = `    // DEBOUNCE DE MENSAGENS RÁPIDAS — V2, mais curto e monitorado.\n`;
const debounceEnd = `    // 3.4. FUNNEL GATE GLOBAL\n`;
const debounceStartIndex = source.indexOf(debounceStart);
const debounceEndIndex = source.indexOf(debounceEnd, debounceStartIndex);
if (debounceStartIndex < 0 || debounceEndIndex < 0) throw new Error("legacy debounce block not found");
source = source.slice(0, debounceStartIndex) + debounceEnd + source.slice(debounceEndIndex + debounceEnd.length);

const runtimeStart = `    // 5. AI PROCESSING (V3)\n`;
const routeStart = `}\n\nexport const Route = createFileRoute("/api/public/hooks/uazapi-webhook")({`;
const runtimeStartIndex = source.indexOf(runtimeStart);
const routeStartIndex = source.indexOf(routeStart, runtimeStartIndex);
if (runtimeStartIndex < 0 || routeStartIndex < 0) throw new Error("legacy runtime section not found");

const durableIngress = `    // 5. DURABLE CUSTOMER TURN INGRESS (Stage C+D)\n    if (!persistedMessageId || !conversationId) {\n      throw new Error("Agent V3 reached without persisted message/conversation id");\n    }\n\n    const ownershipResult = await beginWebhookAgentInboundRuntime(supabaseAdmin, {\n      messageId: persistedMessageId,\n      conversationId,\n      workspaceId,\n      sendTarget,\n      inputText: deferredFunnelMessage || content.text || "",\n      inputKind: content.kind,\n      inputMime: content.mime,\n      deferredFunnel: Boolean(deferredFunnelMessage),\n      holder: \`turn-ingress:\${msgId}:\${Date.now()}\`,\n    });\n\n    console.log("[AGENT-CUSTOMER-TURN] inbound anexado ao turno durável", {\n      phone: phoneStr,\n      messageId: persistedMessageId,\n      jobId: ownershipResult.jobId,\n      turnId: ownershipResult.turnId,\n      duplicate: ownershipResult.duplicate,\n    });\n\n    // Durable-first fast path: wait for natural silence only after the inbound is\n    // persisted. Concurrent requests may race here, but the DB claim allows\n    // exactly one worker to seal this specific turn. If a newer message arrived,\n    // last_received_at moved forward and this attempt returns idle safely.\n    await new Promise((resolve) => setTimeout(resolve, AGENT_CUSTOMER_TURN_QUIET_MS));\n    try {\n      const fastResult = await dispatchReadyCustomerTurnById(\n        supabaseAdmin,\n        ownershipResult.turnId,\n        \`webhook:\${msgId}\`,\n      );\n      console.log("[AGENT-CUSTOMER-TURN] fast path", {\n        turnId: ownershipResult.turnId,\n        status: fastResult.status,\n      });\n    } catch (fastError) {\n      // The durable turn is already committed. Never convert a fast-path failure\n      // into webhook loss: the dispatcher/recovery path remains authoritative.\n      console.error("[AGENT-CUSTOMER-TURN] fast path falhou; turno permanece durável", {\n        turnId: ownershipResult.turnId,\n        error: fastError instanceof Error ? fastError.message : String(fastError),\n      });\n    }\n\n    return new Response("ok (agent customer turn durable)");\n`;
source = source.slice(0, runtimeStartIndex) + durableIngress + source.slice(routeStartIndex);

for (const residue of [
  "finishWebhookAgentInboundRuntime",
  "executeAgentV3Runtime",
  "runtimeOwnership",
  "DEBOUNCE-V2",
  "debounce_v2_",
  "newer message will handle",
]) {
  if (source.includes(residue)) throw new Error(`legacy residue remains: ${residue}`);
}

for (const required of [
  "beginWebhookAgentInboundRuntime",
  "AGENT_CUSTOMER_TURN_QUIET_MS",
  "dispatchReadyCustomerTurnById",
  "ownershipResult.turnId",
]) {
  if (!source.includes(required)) throw new Error(`required fast-path contract missing: ${required}`);
}

fs.writeFileSync(path, source, "utf8");
console.log("STAGE_CD_WEBHOOK_FAST_PATH_OK");
