import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAgentV3Turn } from "@/lib/agent-v3/orchestrator.server";
import { DEFAULT_MODULES } from "@/lib/agent-modules";

const OPENING = "Oi, bom dia! Aqui é a Júlia da Mind. Faz um tempo que você chegou até a gente, ainda tem interesse em impulsionar suas redes?";

function baseAgent() {
  return {
    agent_name: "Júlia",
    tone: "consultivo, humano",
    base_instruction: "Você é a Júlia, atendente humana.",
    script_frio: "",
    script_inativo: "",
    script_ativo: "",
    main_offer: "",
    panel_link: null,
  };
}

function baseContact() {
  return { nome: "Romulo", perfil: "frio" as const };
}

function mockAnthropic(reply: string) {
  return vi.fn(async (url: RequestInfo | URL) => {
    return new Response(
      JSON.stringify({ content: [{ type: "text", text: `[TEMP:quente] [INTENT:compra] [STAGE:fechamento] ${reply}` }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
}

/**
 * Helper to call the V3 orchestrator in a test environment.
 */
async function callAgentV3(opts: {
  history: Array<{ sender: "agente" | "cliente"; body: string }>;
  mockReply: string;
  modules?: Record<string, string>;
  enabledModules?: string[];
}) {
  const fetchMock = mockAnthropic(opts.mockReply);
  vi.stubGlobal("fetch", fetchMock);
  process.env.ANTHROPIC_API_KEY = "test-key";
  
  const res = await runAgentV3Turn({
    userId: "test-workspace",
    message: opts.history[opts.history.length - 1]?.body || "",
    history: opts.history.slice(0, -1),
    customModules: opts.modules || DEFAULT_MODULES,
    enabledModules: opts.enabledModules || Object.keys(DEFAULT_MODULES),
  });
  
  return { ...res, fetchMock };
}

beforeEach(() => {
  vi.unstubAllGlobals?.();
});
afterEach(() => {
  vi.unstubAllGlobals?.();
  vi.restoreAllMocks();
});

describe("V3 Integration: Core Flows", () => {
  it("V3 identifies Spotify and loads relevant modules", async () => {
    const { fetchMock } = await callAgentV3({
      history: [
        { sender: "agente", body: OPENING },
        { sender: "cliente", body: "quais os preços do spotify?" },
      ],
      mockReply: "Temos seguidores por R$30!",
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const systemPrompt = Array.isArray(body.system) ? body.system.map((b: any) => b.text).join("\n") : body.system;
    
    expect(systemPrompt.toLowerCase()).toContain("spotify");
    expect(systemPrompt.toLowerCase()).toContain("tabela de preços");
  });

  it("V3 handles neutral greeting and applies deterministic tags", async () => {
    const { text, temperature, intent } = await callAgentV3({
      history: [
        { sender: "agente", body: OPENING },
        { sender: "cliente", body: "oi" },
      ],
      mockReply: "Olá! Como posso ajudar?",
    });

    expect(text).toBeTruthy();
    expect(temperature).toBe("quente");
    expect(intent).toBe("compra");
  });
});
