import fs from 'fs';
import path from 'path';

const originalPath = path.join(process.cwd(), 'tests/agent-conversation.test.ts');
const originalContent = fs.readFileSync(originalPath, 'utf-8');

let newContent = `
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAgentV3Turn } from "@/lib/agent-v3/orchestrator.server";
import { DEFAULT_MODULES } from "@/lib/agent-modules";

const OPENING = "Oi, bom dia! Aqui é a Júlia da Mind. Faz um tempo que você chegou até a gente, ainda tem interesse em impulsionar suas redes?";

function mockAnthropicV3(reply: string) {
  return vi.fn(async (url: RequestInfo | URL) => {
    return new Response(
      JSON.stringify({ 
        content: [{ 
          type: "text", 
          text: \`[TEMP:quente] [INTENT:compra] [STAGE:vendas] \${reply}\` 
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

function extractSystemText(s: any): string {
  if (typeof s === "string") return s;
  if (Array.isArray(s)) return s.map((b: any) => b.text || "").join("\n\n");
  return "";
}

beforeEach(() => { vi.unstubAllGlobals?.(); });
afterEach(() => { vi.unstubAllGlobals?.(); vi.restoreAllMocks(); });
`;

// Split by describe blocks - more robust regex
const describeRegex = /describe\([\s\S]*?\)\s*=>\s*\{[\s\S]*?\n\}\);/g;
const describes = originalContent.match(describeRegex);

if (describes) {
  describes.forEach(d => {
    // Skip tests that rely on V1 internal functions not present in V3
    if (d.includes('buildSystemPrompt') && !d.includes('callAgent')) {
       return;
    }
    // Skip utility functions tests (they should stay in V1 or be moved to shared)
    if (d.includes('humanizePunctuation') && !d.includes('callAgent')) return;
    if (d.includes('guardFreeTrialOffer') && !d.includes('callAgent')) return;
    
    newContent += "\n" + d;
  });
}

fs.writeFileSync(path.join(process.cwd(), 'tests/agent-v3-full.test.ts'), newContent);
console.log('Testes adaptados salvos em tests/agent-v3-full.test.ts');
