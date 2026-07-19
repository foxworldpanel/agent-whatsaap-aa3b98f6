import { runAgentV3Turn } from "./src/lib/agent-v3/orchestrator.server";
import { DEFAULT_MODULES } from "./src/lib/agent-modules";

async function test() {
  process.env.ANTHROPIC_API_KEY = "test-key";
  
  const originalFetch = global.fetch;
  let capturedSystem = "";
  
  global.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    capturedSystem = body.system[0].text;
    return new Response(JSON.stringify({
      content: [{ type: "text", text: "[TEMP:quente] [INTENT:compra] [STAGE:vendas] Imagina! Somos uma empresa séria com milhares de clientes. Pode ficar tranquilo que a entrega é garantida e segura." }]
    }), { status: 200, headers: { "content-type": "application/json" } });
  } as any;

  try {
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

    console.log("Captured System Prompt contains objection rule:", capturedSystem.includes("não é golpe?"));
    console.log("Response text:", res.text);
  } finally {
    global.fetch = originalFetch;
  }
}

test();
