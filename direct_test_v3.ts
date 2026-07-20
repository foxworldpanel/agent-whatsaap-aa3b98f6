
import { runAgentV3Turn } from './src/lib/agent-v3/orchestrator.server';

async function test() {
  console.log("--- TESTE 1: Saudação pura ---");
  const res1 = await runAgentV3Turn({
    userId: "test-user",
    message: "Boa noite",
    history: [],
    enabledModules: ["spotify", "instagram", "pagamentos"]
  });
  console.log("Resposta 1:", res1.replies.join(" | "));
  
  console.log("\n--- TESTE 2: Contexto 'plays' (Spotify) ---");
  const res2 = await runAgentV3Turn({
    userId: "test-user",
    message: "quero comprar plays",
    history: [
      { role: "customer", content: "Boa noite" },
      { role: "agent", content: res1.replies[0] }
    ],
    enabledModules: ["spotify", "instagram", "pagamentos"]
  });
  console.log("Resposta 2:", res2.replies.join(" | "));
  
  // Verificação de saudação repetida no turno 2
  const hasGreetingInTurn2 = /boa\s*noite|bom\s*dia|olá|oi/i.test(res2.replies[0]);
  console.log("\nTurno 2 repetiu saudação?", hasGreetingInTurn2 ? "SIM (BUG)" : "NÃO (CORRETO)");
  
  // Verificação de contexto Spotify
  const hasSpotifyContext = /spotify|música|plays/i.test(res2.replies[0]) || !/qual\s*rede/i.test(res2.replies[0]);
  console.log("Entendeu Spotify?", hasSpotifyContext ? "SIM (CORRETO)" : "NÃO (BUG)");
}

test().catch(console.error);
