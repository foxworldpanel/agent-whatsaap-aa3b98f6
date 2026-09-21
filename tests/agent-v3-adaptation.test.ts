import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAgentV3Turn } from "@/lib/agent-v3/orchestrator.server";
import { DEFAULT_MODULES } from "@/lib/agent-modules";

// Mock do fetch da Anthropic — devolve reply como resposta canônica com metadados V3
function mockAnthropicV3(reply: string) {
  const anthropicMock = vi.fn(async () => {
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

  const fetchMock = (async (input: any, init?: any) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : String(input?.url || input || "");

    if (url.includes("supabase.co")) {
      const body = url.includes("/rest/v1/agent_modules_v3")
        ? JSON.stringify([{
            key: "__test_cms_seed",
            content: "Test-only CMS seed used to satisfy the real fail-closed module loader.",
            enabled: true,
            priority: -1,
            always_load: false,
          }])
        : "[]";
      return new Response(body, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    return anthropicMock(input, init);
  }) as typeof fetch & { mock: typeof anthropicMock.mock };

  fetchMock.mock = anthropicMock.mock;
  return fetchMock;
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
    workspaceId: "test-workspace",
    message: lastMessage,
    history: historyForV3,
    enabledModules: Object.keys(DEFAULT_MODULES),
    customModules: DEFAULT_MODULES,
    anthropicApiKey: "test-key"
  });

  return { 
    text: res.replies.join(" ") , 
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
    expect(text).toBeTruthy();
    expect(text).toMatch(/Júlia|como posso ajudar/i);
  });
});
