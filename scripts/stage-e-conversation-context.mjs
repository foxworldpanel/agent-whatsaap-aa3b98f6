import fs from "node:fs";

const p = "C:/mind-agent-v3-stage-b/src/lib/agent-v3/core/conversation-engine.server.ts";
let s = fs.readFileSync(p, "utf8");

const sourceTypeOld = 'currentTopicSource: "detected" | "persisted" | "none";';
const sourceTypeNew = 'currentTopicSource: "detected" | "persisted" | "history" | "none";';
const localTypeOld = 'let currentTopicSource: "detected" | "persisted" | "none" = "none";';
const localTypeNew = 'let currentTopicSource: "detected" | "persisted" | "history" | "none" = "none";';
const historyMarker = "const recentHistory = history.slice(-12).reverse();";

if (!s.includes(sourceTypeNew)) {
  if (!s.includes(sourceTypeOld)) throw new Error("currentTopicSource contract anchor missing");
  s = s.replace(sourceTypeOld, sourceTypeNew);
}

if (!s.includes(localTypeNew)) {
  if (!s.includes(localTypeOld)) throw new Error("currentTopicSource local anchor missing");
  s = s.replace(localTypeOld, localTypeNew);
}

if (!s.includes(historyMarker)) {
  const anchor = /  if \(currentTopic\) \{\r?\n    currentTopicSource = "detected";\r?\n  \} else if \(previousState\?\.currentTopic\) \{\r?\n    currentTopic = previousState\.currentTopic;\r?\n    currentTopicSource = "persisted";\r?\n  \}/;
  if (!anchor.test(s)) throw new Error("topic recovery anchor missing");

  const replacement = `  if (currentTopic) {
    currentTopicSource = "detected";
  } else if (previousState?.currentTopic) {
    currentTopic = previousState.currentTopic;
    currentTopicSource = "persisted";
  } else {
    // Recover the active platform from recent conversation when the customer
    // replies with a short/ambiguous turn or an imperfect audio transcription.
    // Search newest-first and only accept explicit platform names/aliases.
    const recentHistory = history.slice(-12).reverse();
    for (const item of recentHistory) {
      const recent = String(item.content || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\\u0300-\\u036f]/g, "");
      if (/spotify/i.test(recent)) currentTopic = "spotify";
      else if (/youtube|\\byt\\b/i.test(recent)) currentTopic = "youtube";
      else if (/instagram|\\binsta\\b/i.test(recent)) currentTopic = "instagram";
      else if (/tiktok|tik tok/i.test(recent)) currentTopic = "tiktok";
      else if (/kwai/i.test(recent)) currentTopic = "kwai";
      else if (/facebook|\\bface\\b/i.test(recent)) currentTopic = "facebook";
      if (currentTopic) {
        currentTopicSource = "history";
        break;
      }
    }
  }`;
  s = s.replace(anchor, replacement);
}

const greetingOld = "const greetingAlreadyDone = agentMessages.length > 0 && !sessionRestart;";
const greetingNew = "const greetingAlreadyDone = agentMessages.length > 0;";
if (!s.includes(greetingNew)) {
  if (!s.includes(greetingOld)) throw new Error("greeting anchor missing");
  s = s.replace(greetingOld, greetingNew);
}

fs.writeFileSync(p, s, "utf8");
console.log("STAGE_E_CONVERSATION_CONTEXT_OK");
