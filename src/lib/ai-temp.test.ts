import { test, expect } from "vitest";
import { generateAgentReplyWithMeta } from "./ai.server";

test("Lead temperature extraction should work and remove marker from text", async () => {
  // Simula uma resposta do Claude com o marcador
  const mockResponse = {
    content: [{ type: "text", text: "Olá! Como posso ajudar? [TEMP:morno]" }],
    usage: { input_tokens: 10, output_tokens: 5 }
  };

  // Precisamos mockar o fetch para a Anthropic
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => mockResponse
  }) as any;

  try {
    const result = await generateAgentReplyWithMeta({
      agent: { agent_name: "Júlia", tone: "humano", base_instruction: "", script_frio: "", script_inativo: "", script_ativo: "", main_offer: "", panel_link: "" },
      contact: { nome: "Teste", perfil: "frio" },
      history: [{ sender: "cliente", body: "Oi" }],
      userId: "test-user"
    });

    expect(result.text).toBe("Olá! Como posso ajudar?");
    expect(result.leadTemperature).toBe("morno");
  } finally {
    global.fetch = originalFetch;
  }
});

test("Lead temperature extraction should be case insensitive", async () => {
    const mockResponse = {
      content: [{ type: "text", text: "Tudo bem! [TEMP:QUENTE]" }],
      usage: { input_tokens: 10, output_tokens: 5 }
    };
  
    const originalFetch = global.fetch;
    global.fetch = async () => ({
      ok: true,
      json: async () => mockResponse
    }) as any;
  
    try {
      const result = await generateAgentReplyWithMeta({
        agent: { agent_name: "Júlia", tone: "humano", base_instruction: "", script_frio: "", script_inativo: "", script_ativo: "", main_offer: "", panel_link: "" },
        contact: { nome: "Teste", perfil: "frio" },
        history: [{ sender: "cliente", body: "Quero comprar" }],
        userId: "test-user"
      });
  
      expect(result.text).toBe("Tudo bem!");
      expect(result.leadTemperature).toBe("quente");
    } finally {
      global.fetch = originalFetch;
    }
  });
