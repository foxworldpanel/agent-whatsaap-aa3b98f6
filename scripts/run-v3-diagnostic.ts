
import { runAgentV3Turn } from "../src/lib/agent-v3/orchestrator.server";
import { DEFAULT_MODULES } from "../src/lib/agent-modules";

const userId = "diagnostic-user-" + Date.now();
const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

async function runTurn(message: string, history: any[]) {
  console.log(`\n--- TURN: ${message} ---`);
  const start = Date.now();
  const res = await runAgentV3Turn({
    userId,
    message,
    history,
    enabledModules: Object.keys(DEFAULT_MODULES),
    customModules: DEFAULT_MODULES,
    anthropicApiKey,
    isInbound: true
  });
  const duration = Date.now() - start;

  console.log(`Response: ${res.replies.join(" ")}`);
  console.log(`Temperature: ${res.temperature}, Intent: ${res.intent}, Stage: ${res.stage}`);
  console.log(`Usage:`, JSON.stringify(res.usage, null, 2));
  console.log(`Duration: ${duration}ms`);

  return res;
}

async function runDiagnostic() {
  console.log("Starting V3 Diagnostic...");
  
  if (!anthropicApiKey) {
    console.error("ANTHROPIC_API_KEY not found!");
    process.exit(1);
  }

  // 1. CACHE TEST (3 TURNS)
  console.log("\n=== 1. CACHE TEST (3 TURNS) ===");
  const history: any[] = [];
  
  const t1 = await runTurn("Oi, tudo bem?", history);
  history.push({ role: "user", content: "Oi, tudo bem?" });
  history.push({ role: "agent", content: t1.replies.join(" ") });
  
  // Wait a bit to ensure sequential calls
  await new Promise(r => setTimeout(r, 2000));
  
  const t2 = await runTurn("Quero saber o preço do Spotify", history);
  history.push({ role: "user", content: "Quero saber o preço do Spotify" });
  history.push({ role: "agent", content: t2.replies.join(" ") });

  await new Promise(r => setTimeout(r, 2000));

  const t3 = await runTurn("E pro Instagram?", history);
  
  // 2. LANGUAGE TEST
  console.log("\n=== 2. LANGUAGE TEST ===");
  
  console.log("\nTesting English:");
  await runTurn("Good afternoon, I want Instagram followers.", []);
  
  console.log("\nTesting Spanish:");
  await runTurn("Buenas tardes, quiero seguidores de Instagram.", []);
  
  console.log("\nTesting Portuguese:");
  await runTurn("Boa tarde, quero seguidores no Instagram.", []);

  console.log("\nDiagnostic Complete.");
}

runDiagnostic().catch(console.error);
