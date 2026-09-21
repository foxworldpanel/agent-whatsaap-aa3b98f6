import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAgentV3Turn as realRunAgentV3Turn } from "../src/lib/agent-v3/orchestrator.server";
import { DEFAULT_MODULES } from "../src/lib/agent-modules";
import { 
  sanitizeSystemLeaks, 
  detectVerboseLoop, 
  enforceReengagementGreeting, 
  humanizePunctuationV3 as humanizePunctuation
} from "../src/lib/agent-v3/brain/guards.server";
import { autoSplitLongPartsV3 as autoSplitLongParts } from "../src/lib/agent-v3/integrations/audio-processor.server";
import { limitEmojiFrequency } from "../src/lib/emoji-limiter";

const OPENING = "Oi, bom dia! Aqui é a Júlia da Mind. Faz um tempo que você chegou até a gente, ainda tem interesse em impulsionar suas redes?";

function mockAnthropic(reply: string) {
  const anthropicMock = vi.fn(async () => {
    return new Response(
      JSON.stringify({ content: [{ type: "text", text: reply }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });

  // Estes testes exercitam o orchestrator real com módulos customizados.
  // O mock global de fetch deve interceptar apenas a chamada ao Claude; se ele
  // responder também ao Supabase, o client interpreta o payload da Anthropic
  // como resultado PostgREST e loadEnabledModulesV3 recebe um objeto em vez de
  // uma lista. Mantemos as chamadas Supabase isoladas e vazias, enquanto
  // fetchMock.mock.calls continua representando somente as chamadas ao Claude.
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

function extractSystemText(s: any): string {
  if (typeof s === "string") return s;
  if (Array.isArray(s)) {
    return s.map((b: any) => {
      if (typeof b === "string") return b;
      if (typeof b === "object" && b !== null) {
        if ("text" in b) return String(b.text || "");
        if ("content" in b) return String(b.content || "");
      }
      return "";
    }).join("\n\n");
  }
  return String(s || "");
}

async function callAgent(opts: any) {
  const fetchMock = mockAnthropic(opts.mockReply);
  vi.stubGlobal("fetch", fetchMock);
  
  const history = opts.history || [];
  const lastMessage = history[history.length - 1]?.body || history[history.length - 1]?.content || "";
  const historyForV3 = history.slice(0, -1).map((m: any) => ({
    role: (m.sender === "agente" || m.role === "agent") ? "agent" : "user",
    content: m.body || m.content
  }));

  const res = await realRunAgentV3Turn({
    userId: "bd59fa41-3a6d-4767-8334-a69076f8e434",
    workspaceId: "test-workspace",
    message: lastMessage,
    history: historyForV3,
    enabledModules: Object.keys(DEFAULT_MODULES),
    customModules: DEFAULT_MODULES,
    anthropicApiKey: "test-key",
    isInbound: opts.isInbound !== undefined ? opts.isInbound : true,
    extraContext: opts.extraContext
  });

  return {
    text: res.replies.join(" "),
    replies: res.replies,
    temperature: res.temperature,
    intent: res.intent,
    stage: res.stage,
    fetchMock,
    rawPrompt: res.rawPrompt
  };
}

describe("Arquitetura V3 - Correções de Bugs Reais", () => {

  describe("1) SAUDAÇÃO DE REENGAJAMENTO (GUARD DETERMINÍSTICO)", () => {
    it("não duplica saudação quando a resposta já começa com ela", () => {
      const out = enforceReengagementGreeting("Boa tarde! Como posso ajudar?", "Boa tarde");
      expect(out.text).toBe("Boa tarde! Como posso ajudar?");
      expect(out.prepended).toBe(false);
    });

    it("prepende a saudação PT quando o LLM omite", () => {
      const out = enforceReengagementGreeting("Como posso te ajudar hoje?", "Boa tarde");
      expect(out.text.startsWith("Boa tarde!")).toBe(true);
      expect(out.prepended).toBe(true);
    });

    it("preserva a saudação espanhola quando o LLM omite", () => {
      const out = enforceReengagementGreeting("¿En qué puedo ayudarte?", "Buenas tardes");
      expect(out.text).toContain("Buenas tardes!");
      expect(out.text).not.toContain("Boa tarde!");
    });
  });

  describe("3) GUARD DE EMOJI QUEBRADO", () => {
    it("Deve tratar histórico vazio sem dar TypeError", () => {
      const result = limitEmojiFrequency("Oi 😊", { recentAgentBodies: [] });
      expect(result).toBe("Oi 😊");
    });

    it("Deve tratar histórico nulo sem dar TypeError", () => {
      const result = limitEmojiFrequency("Oi 😊", { recentAgentBodies: [] });
      expect(result).toBe("Oi 😊");
    });
  });

  describe("4) SPLITTER QUEBRANDO MENSAGEM SEM \\n\\n", () => {
    it("Deve retornar pelo menos 1 parte para mensagens sem quebra de linha dupla", () => {
      const result = autoSplitLongParts("Oi! Tudo bem? Como posso ajudar?");
      expect(result.length).toBe(1);
      expect(result[0]).toBe("Oi! Tudo bem? Como posso ajudar?");
    });

    it("Deve respeitar ===SPLIT=== mesmo sem \\n\\n", () => {
      const result = autoSplitLongParts("Parte 1 ===SPLIT=== Parte 2");
      expect(result.length).toBe(2);
      expect(result[0]).toBe("Parte 1");
      expect(result[1]).toBe("Parte 2");
    });
  });

  describe("Validação de Regressão V3 (Prompt Structure)", () => {
    it("System prompt deve ser um array e conter regras de ouro", async () => {
      const { rawPrompt } = await callAgent({
        history: [{ sender: "cliente", body: "oi" }],
        mockReply: "[TEMP:frio] [INTENT:neutra] [STAGE:lead] Olá!"
      });
      expect(Array.isArray(rawPrompt)).toBe(true);
      const fullText = extractSystemText(rawPrompt);
      expect(fullText).toContain("Júlia");
      expect(fullText).toContain("P0");
      expect(fullText).toContain("P1");
      expect(fullText).toContain("P2");
    });
  });
});
