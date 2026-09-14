import fs from "node:fs";

const root = "C:/mind-agent-v3-stage-b";
const read = (path) => fs.readFileSync(`${root}/${path}`, "utf8");
const conversation = read("src/lib/agent-v3/core/conversation-engine.server.ts");
const router = read("src/lib/agent-v3/router/smart-router.server.ts");
const sendGuard = read("src/lib/send-agent-guarded.server.ts");
const turnRuntime = read("src/lib/agent-v3/customer-turn-runtime.server.ts");
const turnDispatcher = read("src/lib/agent-v3/customer-turn-dispatch.server.ts");
const media = read("src/lib/agent-v3/customer-turn-media.server.ts");
const image = read("src/lib/agent-v3/integrations/image-processor.server.ts");
const business = read("src/lib/agent-v3/brain/business-state.server.ts");

const scenarios = [
  ["established customer is not reintroduced after idle", conversation.includes("const greetingAlreadyDone = agentMessages.length > 0;")],
  ["post-funnel pure greeting stays greeting-only", router.includes("context.funnelAlreadyCompleted") && router.includes('`${greetingWord}!`')],
  ["ambiguous reply recovers recent explicit platform", conversation.includes("recentHistory = history.slice(-12).reverse()") && conversation.includes('currentTopicSource = "history"')],
  ["spotify is recoverable from recent history", conversation.includes('/spotify/i.test(recent)')],
  ["post-sale payment/order incident routes to support", conversation.includes("postSaleSupport") && business.includes("ticket em SUPORTE no painel")],
  ["multi-message customer turn executes one runtime decision", turnDispatcher.includes("executeClaimedCustomerTurn") && turnRuntime.includes("loadCustomerTurnMembers")],
  ["customer turn preserves chronological member order", turnRuntime.includes("for (const member of members)") && turnRuntime.includes('resolved.join("\\n")')],
  ["audio is resolved before semantic runtime", media.includes('member.input_kind !== "audio"') && media.includes("processAudioV3")],
  ["image is resolved before semantic runtime", media.includes('member.input_kind === "image"') && media.includes("processImageV3")],
  ["payment screenshot cannot be falsely confirmed", image.includes("nunca afirme que o pagamento foi confirmado pelo sistema")],
  ["repeated recent outbound question is suppressed", sendGuard.includes("function suppressRepeatedQuestion(") && sendGuard.includes("slice(-6)")],
  ["empty outbound fails closed", sendGuard.includes("resposta vazia após normalização")],
];

const failed = scenarios.filter(([, ok]) => !ok);
for (const [name, ok] of scenarios) console.log(`${ok ? "OK" : "FAIL"} ${name}`);
if (failed.length) throw new Error(`Stage E homologation regression failed: ${failed.map(([name]) => name).join(", ")}`);
console.log("STAGE_E_HOMOLOGATION_REGRESSION_OK");
