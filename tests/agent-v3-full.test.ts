
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAgentV3Turn as realRunAgentV3Turn } from "../src/lib/agent-v3/orchestrator.server";
import { DEFAULT_MODULES } from "../src/lib/agent-modules";
import * as aiServer from "../src/lib/ai.server";
import * as emojiLimiter from "../src/lib/emoji-limiter";
import * as messageSplitter from "../src/lib/message-splitter";

const OPENING = "Oi, bom dia! Aqui é a Júlia da Mind. Faz um tempo que você chegou até a gente, ainda tem interesse em impulsionar suas redes?";

const baseAgent = () => ({
    agent_name: "Júlia",
    tone: "consultivo, humano",
    base_instruction: "Você é a Júlia, atendente humana.",
    persona: "Atendente da Mind SMM.",
    regra_emoji: "Use emojis moderadamente.",
    regra_split: "Divida em bolhas curtas.",
    terminologia_redes: "YouTube: views.",
    regra_anti_invencao: "Não invente.",
    exemplo_disparo: "Qual rede você quer?",
    regra_encerramento: "Tchau.",
    regra_estilo_escrita: "Direto."
});

// Polyfill extractSystemText for V3
const extractSystemText = (system: any): string => {
  if (!system) return "";
  if (typeof system === 'string') return system;
  if (Array.isArray(system)) {
    return system.map(part => typeof part === 'string' ? part : (part.text || "")).join("\n\n");
  }
  return "";
};

async function generateAgentReplyWithMeta(history: any[], opts: any = {}) {
  const lastMessage = history[history.length - 1]?.content || "";
  const historyForV3 = history.slice(0, -1).map(m => ({
    role: m.sender === "agente" ? "agent" : "user",
    content: m.body || m.content
  }));

  const res = await realRunAgentV3Turn({
    userId: "bd59fa41-3a6d-4767-8334-a69076f8e434",
    message: lastMessage,
    history: historyForV3,
    enabledModules: Object.keys(DEFAULT_MODULES),
    customModules: DEFAULT_MODULES,
    anthropicApiKey: "test-key",
    isInbound: opts.isInbound !== undefined ? opts.isInbound : true,
    extraContext: opts.extraContext
  });

  globalThis.__last_agent_payload = { system: res.rawPrompt }; 
  return {
    text: res.replies.join(" "),
    replies: res.replies,
    temperature: res.temperature,
    intent: res.intent,
    stage: res.stage
  };
}
undefined