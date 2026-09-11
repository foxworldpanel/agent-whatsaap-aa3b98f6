import fs from "node:fs";
import path from "node:path";

const file = path.resolve("src/routes/api/public/hooks/uazapi-webhook.ts");
let s = fs.readFileSync(file, "utf8");
const original = s;

function once(label, from, to) {
  const count = s.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly 1 anchor, found ${count}`);
  s = s.replace(from, to);
}

once(
  "imports",
  'import { generateTraceId, logExecutionTrace } from "@/lib/agent-v3/telemetry/execution-tracer.server";\n',
  'import { generateTraceId, logExecutionTrace } from "@/lib/agent-v3/telemetry/execution-tracer.server";\nimport {\n  beginWebhookAgentInboundRuntime,\n  finishWebhookAgentInboundRuntime,\n} from "@/lib/agent-v3/inbound-webhook-ownership.server";\n',
);

const helperStart = '\n\nasync function ensureAgentInboundJob(';
const helperEnd = '\n// Deduplicação em memória por messageId.';
const a = s.indexOf(helperStart);
const b = s.indexOf(helperEnd);
if (a < 0 || b < 0 || b <= a) throw new Error("legacy inbound helper block anchors not found");
s = s.slice(0, a) + "\n" + s.slice(b);

once(
  "duplicate audit",
  'console.log(`[UAZ-WEBHOOK] [AUDIT] Mensagem duplicada (msgId ${msgId}) — pulando resposta da IA, mas ainda verificando Welcome Funnel (idempotente).`);',
  'console.log(`[UAZ-WEBHOOK] [AUDIT] Mensagem duplicada (msgId ${msgId}) — Welcome Funnel continua idempotente; após os gates, ownership durável decide se o Agent V3 ainda precisa processar.`);',
);

const duplicateGate = `\n\n    // Bloqueio da resposta da IA pra mensagens duplicadas — o Welcome Funnel\n    // já teve a chance de rodar acima (idempotente), agora sim replicamos o\n    // comportamento original: nunca gerar uma 2ª resposta de IA pro cliente.\n    if (isDuplicateInMemory || isDuplicateDelivery) {\n      console.log(\`[UAZ-WEBHOOK] [AUDIT] RETORNO: duplicate msgId (após checagem do funil): \${msgId}\`);\n      return new Response("ok (duplicate msgId, after funnel check)");\n    }\n`;
once(
  "duplicate gate",
  duplicateGate,
  `\n\n    // Duplicata do provedor não prova que o Agent V3 já processou a mensagem.\n    // Depois de todos os gates de elegibilidade, o job durável é a fonte de\n    // verdade: retry pode reparar o crash entre persistir messages e criar job.\n    if (isDuplicateInMemory || isDuplicateDelivery) {\n      console.log(\`[UAZ-WEBHOOK] [AUDIT] Retry elegível seguirá até ownership durável: \${msgId}\`);\n    }\n`,
);

const ownershipStart = '      const lockHolder = `v3:${msgId}:${Date.now()}`;\n\n      await ensureAgentInboundJob(';
const runtimeMarker = '      let runtimeNeedsReview = false;\n      try {\n';
const os = s.indexOf(ownershipStart);
const rm = s.indexOf(runtimeMarker, os);
if (os < 0 || rm < 0) throw new Error("legacy ownership boundary anchors not found");
const replacement = `      const lockHolder = \`v3:\${msgId}:\${Date.now()}\`;\n\n      const ownershipResult = await beginWebhookAgentInboundRuntime(supabaseAdmin, {\n        messageId: persistedMessageId,\n        conversationId,\n        workspaceId,\n        sendTarget,\n        inputText: deferredFunnelMessage || content.text || "",\n        inputKind: content.kind,\n        inputMime: content.mime,\n        deferredFunnel: Boolean(deferredFunnelMessage),\n        holder: lockHolder,\n      });\n\n      if (ownershipResult.status !== "claimed") {\n        console.log("[UAZ-WEBHOOK] Agent inbound não entrou no runtime síncrono", {\n          phone: phoneStr,\n          messageId: persistedMessageId,\n          status: ownershipResult.status,\n        });\n        return new Response(\`ok (inbound ownership \${ownershipResult.status})\`);\n      }\n\n      const runtimeOwnership = ownershipResult.ownership;\n      let runtimeNeedsReview = false;\n      let runtimeFailure: string | null = null;\n      try {\n`;
s = s.slice(0, os) + replacement + s.slice(rm + runtimeMarker.length);

const catchOld = `        const criticalErrorMessage = String(e?.message ?? e ?? "erro desconhecido");\n        runtimeNeedsReview = true;`;
once(
  "runtime catch state",
  catchOld,
  `        const criticalErrorMessage = String(e?.message ?? e ?? "erro desconhecido");\n        runtimeNeedsReview = true;\n        runtimeFailure = criticalErrorMessage;`,
);

const reviewStart = `\n        try {\n          await reviewAgentInboundJob(\n            supabaseAdmin,\n            persistedMessageId,\n            lockHolder,\n            \`Agent V3 critical error: \${criticalErrorMessage}\`,\n          );\n        } catch (jobError) {\n          console.error("[UAZ-WEBHOOK] Falha ao marcar inbound job para revisão:", jobError);\n        }\n`;
once("legacy review", reviewStart, "\n");

const finalStart = `      } finally {\n        // Finaliza a ownership durável ANTES de liberar a conversa. Assim outro\n        // worker nunca observa a conversa livre enquanto este job ainda aparece\n        // como processing. Se a conclusão falhar após possíveis efeitos externos,\n        // mantemos processing: a recuperação de stale o levará a needs_review,\n        // nunca a replay cego.\n        if (!runtimeNeedsReview) {\n          try {\n            await completeAgentInboundJob(\n              supabaseAdmin,\n              persistedMessageId,\n              lockHolder,\n            );\n          } catch (jobError) {\n            console.error(\n              "[UAZ-WEBHOOK] Falha ao concluir agent inbound job; mantendo estado seguro para revisão:",\n              jobError,\n            );\n          }\n        }\n\n        await releaseConversationDbLock(\n          supabaseAdmin,\n          conversationId,\n          lockHolder,\n        );\n      }\n`;
const finalReplacement = `      } finally {\n        // A mesma fronteira terminal usada pelo dispatcher resolve o job antes\n        // de liberar a geração. Falha após entrada no runtime nunca volta para\n        // pending/replay automático.\n        try {\n          await finishWebhookAgentInboundRuntime(\n            supabaseAdmin,\n            runtimeOwnership,\n            runtimeNeedsReview\n              ? { status: "needs_review", error: \`Agent V3 critical error: \${runtimeFailure || "erro desconhecido"}\` }\n              : { status: "ok" },\n          );\n        } catch (ownershipFinalizeError) {\n          console.error(\n            "[UAZ-WEBHOOK] Falha ao finalizar ownership durável; mantendo estado seguro para recovery/review:",\n            ownershipFinalizeError,\n          );\n        }\n      }\n`;
once("legacy finalizer", finalStart, finalReplacement);

for (const forbidden of [
  "async function ensureAgentInboundJob(",
  "async function claimAgentInboundJob(",
  "async function releaseAgentInboundJob(",
  "async function enterAgentInboundRuntime(",
  "async function reviewAgentInboundJob(",
  "async function completeAgentInboundJob(",
  "ok (duplicate msgId, after funnel check)",
]) {
  if (s.includes(forbidden)) throw new Error(`legacy Stage B residue remains: ${forbidden}`);
}
if (!s.includes("beginWebhookAgentInboundRuntime")) throw new Error("shared begin boundary missing");
if (!s.includes("finishWebhookAgentInboundRuntime")) throw new Error("shared finalizer missing");
if (s === original) throw new Error("no changes produced");

fs.writeFileSync(file, s, "utf8");
console.log(`Stage B webhook centralization prepared: ${original.length} -> ${s.length} chars`);
