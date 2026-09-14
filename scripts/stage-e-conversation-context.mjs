import fs from "node:fs";

const p = "C:/mind-agent-v3-stage-b/src/lib/agent-v3/core/conversation-engine.server.ts";
let s = fs.readFileSync(p, "utf8");

if (!s.includes('currentTopicSource: "detected" | "persisted" | "none";')) {
  if (s.includes('currentTopicSource: "detected" | "persisted" | "history" | "none";')) {
    console.log("STAGE_E_CONTEXT_ALREADY_APPLIED");
    process.exit(0);
  }
  throw new Error("currentTopicSource anchor missing");
}

s = s.replace(
  'currentTopicSource: "detected" | "persisted" | "none";',
  'currentTopicSource: "detected" | "persisted" | "history" | "none";',
);

const anchor = '  if (currentTopic) {\n    currentTopicSource = "detected";\n  } else if (previousState?.currentTopic) {\n    currentTopic = previousState.currentTopic;\n    currentTopicSource = "persisted";\n  }';
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

if (!s.includes(anchor)) throw new Error("topic recovery anchor missing");
s = s.replace(anchor, replacement);

// A greeting is a conversation-level fact. A long idle period can change the
// session, but it must not make the agent introduce itself again.
s = s.replace(
  'const greetingAlreadyDone = agentMessages.length > 0 && !sessionRestart;',
  'const greetingAlreadyDone = agentMessages.length > 0;',
);

fs.writeFileSync(p, s, "utf8");
console.log("STAGE_E_CONVERSATION_CONTEXT_OK");
