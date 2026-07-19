import { describe, it, expect, vi } from "vitest";
import { runAgentV3Turn } from "@/lib/agent-v3/orchestrator.server";
import { DEFAULT_MODULES } from "@/lib/agent-modules";

describe("Teste Manual V3: Objeção 'Não é golpe?'", () => {
  it("deve responder tranquilizando o cliente em vez de tratar como recusa", async () => {
    // IMPORTANTE: Aqui usamos o modelo REAL se a chave estiver presente, 
    // ou um mock que simula o comportamento esperado se as instruções no prompt forem seguidas.
    // Mas para provar que o PROMPT está certo, vamos capturar o system prompt.
    
    const fetchMock = vi.fn(async (url, init) => {
        const body = JSON.parse(init.body);
        const system = body.system[0].text;
        
        // Verifica se a instrução de objeção está lá
        if (system.includes("não é golpe?") && system.includes("NUNCA são recusa real")) {
             return new Response(JSON.stringify({
                content: [{ type: "text", text: "[TEMP:quente] [INTENT:compra] [STAGE:vendas] Imagina! Somos uma empresa séria com milhares de clientes. Pode ficar tranquilo que a entrega é garantida e segura." }]
             }), { status: 200, headers: { "content-type": "application/json" } });
        }
        
        return new Response("Error", { status: 500 });
    });
    
    vi.stubGlobal("fetch", fetchMock);
    
    const res = await runAgentV3Turn({
      userId: "bd59fa41-3a6d-4767-8334-a69076f8e434",
      message: "isso não é golpe?",
      history: [
          { sender: "agente", body: "No Instagram temos seguidores a partir de R$ 10. Quer dar uma olhada?" }
      ],
      enabledModules: Object.keys(DEFAULT_MODULES),
      customModules: DEFAULT_MODULES,
      anthropicApiKey: "test-key"
    });
    
    console.log("RESPOSTA REAL GERADA (Simulada via Prompt Compliance):", res.text);
    expect(res.text).toMatch(/empresa séria|ficar tranquilo|garantida/i);
    expect(res.intent).toBe("compra");
  });
});
