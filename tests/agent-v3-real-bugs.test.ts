import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAgentV3Turn as realRunAgentV3Turn } from "../src/lib/agent-v3/orchestrator.server";
import { DEFAULT_MODULES } from "../src/lib/agent-modules";
import { 
  sanitizeSystemLeaks, 
  detectVerboseLoop, 
  enforceReengagementGreeting, 
  limitEmojiFrequency,
  humanizePunctuationV3 as humanizePunctuation
} from "../src/lib/agent-v3/guards.server";
import { autoSplitLongPartsV3 as autoSplitLongParts } from "../src/lib/agent-v3/audio-processor.server";

const OPENING = "Oi, bom dia! Aqui é a Júlia da Mind. Faz um tempo que você chegou até a gente, ainda tem interesse em impulsionar suas redes?";

function mockAnthropic(reply: string) {
  return vi.fn(async (url: any) => {
    return new Response(
      JSON.stringify({ content: [{ type: "text", text: reply }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
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

  describe("1) SAUDAÇÃO DUPLICADA (EN/ES/PT)", () => {
    it("NÃO deve duplicar saudação em Inglês quando o LLM já a incluiu", async () => {
      const { text } = await callAgent({
        history: [{ sender: "cliente", body: "Good afternoon" }],
        mockReply: "[TEMP:quente] [INTENT:venda] [STAGE:lead] Good afternoon! How can I help you?",
        isInbound: true
      });
      // "Good afternoon! Good afternoon! ..." seria erro.
      const occurrences = (text.match(/Good afternoon/gi) || []).length;
      expect(occurrences).toBe(1);
    });

    it("NÃO deve duplicar saudação em Português", async () => {
      const { text } = await callAgent({
        history: [{ sender: "cliente", body: "Boa tarde" }],
        mockReply: "[TEMP:quente] [INTENT:venda] [STAGE:lead] Boa tarde! Como posso ajudar?",
        isInbound: true
      });
      const occurrences = (text.match(/Boa tarde/gi) || []).length;
      expect(occurrences).toBe(1);
    });

    it("Deve prepender saudação quando o LLM esquece", async () => {
      const { text } = await callAgent({
        history: [{ sender: "cliente", body: "Boa tarde" }],
        mockReply: "[TEMP:quente] [INTENT:venda] [STAGE:lead] Como posso te ajudar hoje?",
        isInbound: true
      });
      expect(text.startsWith("Boa tarde!")).toBe(true);
    });
  });

  describe("2) FALLBACK ESPANHOL → PORTUGUÊS", () => {
    it("Deve mapear 'Buenas tardes' para saudação em Espanhol, não Português", async () => {
      const { text } = await callAgent({
        history: [{ sender: "cliente", body: "Buenas tardes" }],
        mockReply: "[TEMP:quente] [INTENT:venda] [STAGE:lead] ¿En qué posso ayudarte?",
        isInbound: true
      });
      // Se fosse falha, viria "Boa noite! ¿En qué posso ayudarte?" (fallback PT)
      expect(text).toContain("Buenas tardes!");
      expect(text).not.toContain("Boa noite!");
      expect(text).not.toContain("Boa tarde!");
    });
  });

  describe("3) GUARD DE EMOJI QUEBRADO", () => {
    it("Deve tratar histórico vazio sem dar TypeError", () => {
      const result = limitEmojiFrequency("Oi 😊", []);
      expect(result).toBe("Oi 😊");
    });

    it("Deve tratar histórico nulo sem dar TypeError", () => {
      const result = limitEmojiFrequency("Oi 😊", null as any);
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
      expect(fullText).toContain("REGRAS DE OURO");
    });
  });
});
