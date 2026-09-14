import fs from "node:fs";

const root = "C:/mind-agent-v3-stage-b";
const read = (path) => fs.readFileSync(`${root}/${path}`, "utf8");
const business = read("src/lib/agent-v3/brain/business-state.server.ts");
const conversation = read("src/lib/agent-v3/core/conversation-engine.server.ts");
const sendGuard = read("src/lib/send-agent-guarded.server.ts");
const runtime = read("src/lib/agent-v3/runtime.server.ts");
const router = read("src/lib/agent-v3/router/smart-router.server.ts");

const checks = [
  ["post-sale incident priority", business.includes("isPostSaleIncident") && business.includes("incidente de pedido/pagamento já realizado")],
  ["post-sale beats previous sale state", business.includes('current.state === "pos_venda"') && business.includes('current.reason.includes("incidente")')],
  ["panel support instruction", business.includes("ticket em SUPORTE no painel")],
  ["conversation support precedence", conversation.includes("postSaleSupport") && conversation.indexOf("if (postSaleSupport)") < conversation.indexOf('else if (/pagamento|pix|cartao|boleto/i')],
  ["central markdown cleanup", sendGuard.includes("stripMarkdownFormattingV3") && sendGuard.includes("normalizeWhatsAppPresentation")],
  ["empty outbound fail closed", sendGuard.includes("resposta vazia após normalização")],
  ["customer-turn runtime uses business decision", runtime.includes("deriveBusinessDecisionV3") && runtime.includes("reconcileBusinessDecisionV3")],
  ["post-funnel greeting stays minimal", router.includes("context.funnelAlreadyCompleted") && router.includes('`${greetingWord}!`')],
  ["recent topic recovery applied", conversation.includes('currentTopicSource: "detected" | "persisted" | "history" | "none";') && conversation.includes("recentHistory = history.slice(-12).reverse()")],
  ["greeting does not reset after idle", conversation.includes("const greetingAlreadyDone = agentMessages.length > 0;")],
  ["repeated outbound question guard", sendGuard.includes("function suppressRepeatedQuestion(") && sendGuard.includes("slice(-6)" )],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? "OK" : "FAIL"} ${name}`);
if (failed.length) throw new Error(`Stage E behavior regression failed: ${failed.map(([name]) => name).join(", ")}`);
console.log("STAGE_E_BEHAVIOR_REGRESSION_OK");
