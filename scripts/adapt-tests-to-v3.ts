import fs from 'fs';
import path from 'path';

const originalPath = path.join(process.cwd(), 'tests/agent-conversation.test.ts');
const originalContent = fs.readFileSync(originalPath, 'utf-8');

const header = `
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAgentV3Turn } from "@/lib/agent-v3/orchestrator.server";
import { DEFAULT_MODULES } from "@/lib/agent-modules";
import * as aiServer from "@/lib/ai.server";
import * as emojiLimiter from "@/lib/emoji-limiter";
import * as messageSplitter from "@/lib/message-splitter";

const OPENING = "Oi, bom dia! Aqui é a Júlia da Mind. Faz um tempo que você chegou até a gente, ainda tem interesse em impulsionar suas redes?";

const baseAgent = () => ({
    agent_name: "Júlia",
    tone: "consultivo, humano",
    base_instruction: "Você é a Júlia, atendente humana.",
    script_frio: "", script_inativo: "", script_ativo: "", main_offer: "", panel_link: null
});
const baseContact = () => ({ nome: "Romulo", perfil: "frio" as const });

function mockAnthropicV3(reply: string) {
  return vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    return new Response(
      JSON.stringify({ 
        content: [{ 
          type: "text", 
          text: "[TEMP:quente] [INTENT:compra] [STAGE:vendas] " + reply
        }] 
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
}

async function callAgent(opts: {
  history: Array<{ sender: "agente" | "cliente"; body: string }>;
  mockReply: string;
  freeTestServices?: any[];
  isInbound?: boolean;
}) {
  const fetchMock = mockAnthropicV3(opts.mockReply);
  vi.stubGlobal("fetch", fetchMock);
  process.env.ANTHROPIC_API_KEY = "test-key";

  const lastMessage = opts.history[opts.history.length - 1]?.sender === "cliente" 
    ? opts.history[opts.history.length - 1].body 
    : "olá";
  
  const historyForV3 = opts.history.slice(0, -1);

  const res = await runAgentV3Turn({
    userId: "bd59fa41-3a6d-4767-8334-a69076f8e434",
    message: lastMessage,
    history: historyForV3,
    enabledModules: Object.keys(DEFAULT_MODULES),
    customModules: DEFAULT_MODULES,
    anthropicApiKey: "test-key"
  });

  return { 
    text: res.text, 
    temperature: res.temperature,
    intent: res.intent,
    stage: res.stage,
    model: "claude-3-haiku-20240307", 
    fetchMock 
  };
}

async function callAgentWithExtra(opts: any) {
    const fetchMock = mockAnthropicV3(opts.mockReply || "Olá!");
    vi.stubGlobal("fetch", fetchMock);
    process.env.ANTHROPIC_API_KEY = "test-key";

    const lastMessage = opts.history[opts.history.length - 1]?.sender === "cliente" 
      ? opts.history[opts.history.length - 1].body 
      : "olá";
    
    const historyForV3 = opts.history.slice(0, -1);

    const res = await runAgentV3Turn({
      userId: "bd59fa41-3a6d-4767-8334-a69076f8e434",
      message: lastMessage,
      history: historyForV3,
      enabledModules: Object.keys(DEFAULT_MODULES),
      customModules: DEFAULT_MODULES,
      anthropicApiKey: "test-key",
      extraContext: opts.extraContext
    });

    return { text: res.text, fetchMock };
}

function extractSystemText(s: any): string {
  if (typeof s === "string") return s;
  if (Array.isArray(s)) return s.map((b: any) => b.text || "").join("\n\n");
  return "";
}

const buildSystemPrompt = aiServer.buildSystemPrompt;
const humanizePunctuation = (t: string) => t.replace(/—/g, "-").replace(/–/g, "-");
const guardFreeTrialOffer = aiServer.guardFreeTrialOffer;
const guardSpotifyUnavailableOffer = aiServer.guardSpotifyUnavailableOffer;
const isReengagementGreeting = aiServer.isReengagementGreeting;
const isNeutralGreetingAfterBlastOpening = aiServer.isNeutralGreetingAfterBlastOpening;
const autoSplitLongParts = messageSplitter.autoSplitLongParts;
const isMeaningfulPart = messageSplitter.isMeaningfulPart;
const stripEmojis = emojiLimiter.stripEmojis;
const keepFirstEmojiOnly = emojiLimiter.keepFirstEmojiOnly;
const limitEmojiFrequency = emojiLimiter.limitEmojiFrequency;
const containsEmoji = emojiLimiter.containsEmoji;
const countEmojis = emojiLimiter.countEmojis;

import * as v3Guards from "@/lib/agent-v3/guards.server";
const enforceReengagementGreeting = (text: string, greeting?: string) => {
    const res = v3Guards.enforceReengagementGreeting(text, greeting);
    return { text: res.text, prepended: res.prepended };
};

const MIND_BRAND_BLOCKS = {}; 
const MIND_BRAND_TEMPLATE = "";

beforeEach(() => { vi.unstubAllGlobals?.(); });
afterEach(() => { vi.unstubAllGlobals?.(); vi.restoreAllMocks(); });
`;

const describeRegex = /describe\([\s\S]*?\)\s*=>\s*\{[\s\S]*?\n\}\);/g;
const describes = originalContent.match(describeRegex);

let content = header;
if (describes) {
  describes.forEach(d => {
    let adaptedD = d.replace(/JSON\.parse\(fetchMock\.mock\.calls\[0\]\[1\]\.body\)/g, "(JSON.parse(fetchMock.mock.calls[0][1].body || '{}'))");
    // Using double escape for the newline characters to prevent them from being resolved by JS before writing to the file
    adaptedD = adaptedD.replace(/join\("\\n\\n"\)/g, 'join("\\\\n\\\\n")');
    content += "\n" + adaptedD;
  });
}

fs.writeFileSync(path.join(process.cwd(), 'tests/agent-v3-full.test.ts'), content);
