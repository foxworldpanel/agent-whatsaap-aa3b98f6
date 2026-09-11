import fs from "node:fs";

const root = "C:\\mind-agent-v3-stage-b";
const webhookPath = `${root}\\src\\routes\\api\\public\\hooks\\uazapi-webhook.ts`;
const dispatchPath = `${root}\\src\\lib\\agent-v3\\inbound-job-dispatch.server.ts`;

function replaceExactlyOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${label}: anchor not found`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`${label}: anchor is not unique`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

let webhook = fs.readFileSync(webhookPath, "utf8");
webhook = replaceExactlyOnce(
  webhook,
  `          if (runtimeResult.class === "operational_attention") {\n            console.warn("[AGENT-INBOUND] runtime terminou com atenção operacional", {\n              jobId: runtimeOwnership.jobId,\n              reason: runtimeResult.reason,\n            });\n          }`,
  `          if (runtimeResult.class === "operational_attention") {\n            runtimeNeedsReview = true;\n            runtimeFailure = \`Agent V3 operational attention: \${runtimeResult.reason}\`;\n            console.warn("[AGENT-INBOUND] runtime terminou com atenção operacional", {\n              jobId: runtimeOwnership.jobId,\n              reason: runtimeResult.reason,\n            });\n          }`,
  "webhook operational outcome",
);

let dispatch = fs.readFileSync(dispatchPath, "utf8");
dispatch = replaceExactlyOnce(
  dispatch,
  `    const result = await executeRuntime(supabaseAdmin, runtimeInputFromResumeContext(claim.context));\n    await finishClaimedAgentInbound(supabaseAdmin, claim, { ok: true });\n    return { status: "processed", reason: result.reason };`,
  `    const result = await executeRuntime(supabaseAdmin, runtimeInputFromResumeContext(claim.context));\n    if (result.class === "operational_attention") {\n      await finishClaimedAgentInbound(supabaseAdmin, claim, {\n        ok: false,\n        error: new Error(\`Agent V3 operational attention: \${result.reason}\`),\n      });\n      return { status: "needs_review" };\n    }\n    await finishClaimedAgentInbound(supabaseAdmin, claim, { ok: true });\n    return { status: "processed", reason: result.reason };`,
  "dispatcher operational outcome",
);

fs.writeFileSync(webhookPath, webhook, "utf8");
fs.writeFileSync(dispatchPath, dispatch, "utf8");
console.log("STAGE_B_OPERATIONAL_ATTENTION_OK");
