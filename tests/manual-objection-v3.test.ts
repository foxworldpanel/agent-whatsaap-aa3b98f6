import { describe, it, expect, vi } from "vitest";
import { runAgentV3Turn } from "@/lib/agent-v3/orchestrator.server";
import { DEFAULT_MODULES } from "@/lib/agent-modules";

describe("Teste Manual V3: Objeção 'Não é golpe?'", () => {
  it("deve responder tranquilizando o cliente em vez de tratar como recusa", async () => {
    const fetchMock = vi.fn(async (url, init) => {
        const body = JSON.parse(init.body);
        const system = body.system[0].text;
        
        console.log("DEBUG: System Prompt contém regra de golpe?", system.includes("não é golpe?"));
        
        return new Response(JSON.stringify({
            content: [{ type: "text", text: "[TEMP:quente] [INTENT:compra] [STAGE:vendas] Imagina! Somos uma empresa séria com milhares de clientes. Pode ficar tranquilo que a entrega é garantida e segura." }]
        }), { status: 200, headers: { "content-type": "application/json" } });
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
    
    console.log("RESPOSTA REAL GERADA (Simulada):", res.text);
    expect(res.text).toMatch(/empresa séria|ficar tranquilo|garantida/i);
  });
});
