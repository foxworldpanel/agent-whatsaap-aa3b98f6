import fs from "node:fs";

const p = "C:/mind-agent-v3-stage-b/src/lib/send-agent-guarded.server.ts";
let s = fs.readFileSync(p, "utf8");
if (s.includes("function suppressRepeatedQuestion(")) {
  console.log("STAGE_E_OUTBOUND_QUESTION_GUARD_ALREADY_OK");
  process.exit(0);
}
const anchor = "function normalizeWhatsAppPresentation(text: string): string {";
if (!s.includes(anchor)) throw new Error("presentation anchor missing");
const helper = `function normalizeComparableQuestion(value: string): string {
  return value.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9\\s]/g, " ").replace(/\\s+/g, " ").trim();
}

function suppressRepeatedQuestion(text: string, recentAgentBodies: string[]): string {
  const recentQuestions = new Set(recentAgentBodies
    .flatMap((body) => String(body || "").match(/[^.!?\\n]+\\?/g) ?? [])
    .map(normalizeComparableQuestion).filter((question) => question.length >= 8));
  if (recentQuestions.size === 0) return text;
  return text.replace(/[^.!?\\n]+\\?/g, (question) =>
    recentQuestions.has(normalizeComparableQuestion(question)) ? "" : question)
    .replace(/[ \\t]+\\n/g, "\\n").replace(/\\n{3,}/g, "\\n\\n").trim();
}

`;
s = s.replace(anchor, helper + anchor);
s = s.replace(".limit(opts.emojiWindow ?? 3);", ".limit(Math.max(opts.emojiWindow ?? 3, 6));");
const sendAnchor = "  out = normalizeWhatsAppPresentation(out);";
if (!s.includes(sendAnchor)) throw new Error("send normalization anchor missing");
s = s.replace(sendAnchor, `${sendAnchor}\n  out = suppressRepeatedQuestion(out, (recent ?? []).slice(-6));`);
fs.writeFileSync(p, s, "utf8");
console.log("STAGE_E_OUTBOUND_QUESTION_GUARD_OK");
