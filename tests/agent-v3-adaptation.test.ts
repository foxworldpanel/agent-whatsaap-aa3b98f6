import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAgentV3Turn } from "@/lib/agent-v3/orchestrator.server";
import { DEFAULT_MODULES } from "@/lib/agent-modules";

// Mock do fetch da Anthropic — devolve reply como resposta canônica com metadados V3
function mockAnthropicV3(reply: string) {
  return vi.fn(async (url: RequestInfo | URL) => {
    return new Response(
      JSON.stringify({ 
        content: [{ 
          type: "text", 
          text: `[TEMP:quente] [INTENT:compra] [STAGE:vendas] ${reply}` 
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

describe("V3 Adaptation Check", () => {
  it("Setup check: callAgent redirecting to V3 works", async () => {
    const { text } = await callAgent({
      history: [{ sender: "cliente", body: "Olá" }],
      mockReply: "Oi, como posso ajudar?"
    });
    expect(text).toContain("Oi");
  });
});
