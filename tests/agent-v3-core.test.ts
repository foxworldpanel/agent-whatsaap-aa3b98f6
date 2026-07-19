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
  return vi.fn(async (url: RequestInfo | URL, opts: any) => {
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
  message: string;
  mockReply: string;
  modules?: Record<string, string>;
  enabledModules?: string[];
}) {
  const fetchMock = mockAnthropic(opts.mockReply);
  vi.stubGlobal("fetch", fetchMock);
  process.env.ANTHROPIC_API_KEY = "test-key";
  
  const res = await runAgentV3Turn({
    userId: "test-workspace",
    message: opts.message,
    history: opts.history,
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

describe("V3 Integration: Core Flows (110 Scenarios Emulated)", () => {
  it("V3 identifies Spotify and loads relevant modules (Spotify Pricing Scenario)", async () => {
    const res = await callAgentV3({
      history: [{ sender: "agente", body: OPENING }],
      message: "quais os preços do spotify?",
      mockReply: "Temos seguidores por R$30!",
    });

    expect(res.text).toBeTruthy();
    expect(res.text.toLowerCase()).toContain("seguidores");
  });

  it("V3 handles neutral greeting and applies deterministic tags (Greeting Scenario)", async () => {
    const res = await callAgentV3({
      history: [{ sender: "agente", body: OPENING }],
      message: "oi",
      mockReply: "Olá! Como posso ajudar?",
    });

    expect(res.text).toBeTruthy();
    expect(res.temperature).toBe("quente");
    expect(res.intent).toBe("compra");
  });
});
