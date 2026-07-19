import { runAgentV3Turn } from "./src/lib/agent-v3/orchestrator.server";

async function testCache() {
  console.log("--- TESTE REAL DE CACHE V3 ---");
  const input = {
    userId: "bd59fa41-a185-481a-967a-18b57116790a",
    message: "Olá, quanto custa 1000 seguidores no Instagram?",
    history: [],
    enabledModules: ["instagram", "pagamentos"],
    anthropicApiKey: process.env.ANTHROPIC_API_KEY
  };

  try {
    console.log("Chamada 1 (Criação)...");
    const res1 = await runAgentV3Turn(input);
    console.log("Usage 1:", res1.usage);

    // Esperar um pouco para o cache estabilizar na Anthropic
    console.log("Aguardando 5 segundos...");
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log("Chamada 2 (Leitura)...");
    const res2 = await runAgentV3Turn({
      ...input,
      message: "E para o YouTube?",
      history: [
        { role: "user", content: input.message },
        { role: "agent", content: res1.replies.join(" ") }
      ]
    });
    console.log("Usage 2:", res2.usage);

    if (res2.usage?.cache_read_input_tokens && res2.usage.cache_read_input_tokens > 0) {
      console.log("✅ SUCESSO: Cache lido com sucesso!");
    } else {
      console.log("❌ FALHA: cache_read_input_tokens é 0 ou undefined.");
    }
  } catch (e) {
    console.error("Erro no teste:", e);
  }
}

testCache();
