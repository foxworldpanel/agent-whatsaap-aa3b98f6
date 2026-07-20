import { runAgentV3Turn } from "./src/lib/agent-v3/orchestrator.server";

async function test(label: string, message: string) {
  const result = await runAgentV3Turn({
    userId: "f8da521a-3e47-495c-9c94-118e93245051", // Mind Workspace
    message,
    history: [],
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || "mock-key"
  });
  
  const systemPrompt = result.rawPrompt[0].text;
  const chars = systemPrompt.length;
  const modules = result.rawPrompt[0].text.includes("MÓDULO") ? "YES" : "NO";
  
  console.log(`\n=== TEST: ${label} ===`);
  console.log(`Input: "${message}"`);
  console.log(`Chars: ${chars}`);
  console.log(`Tokens (approx): ${Math.ceil(chars/4)}`);
  console.log(`Modules Loaded:`, systemPrompt.match(/MÓDULO [A-Z_ ]+/g) || []);
}

async function run() {
  await test("Saudação Simples", "Bom dia");
  await test("Intenção Comercial", "Quero seguidores");
  await test("Rede Detectada (Spotify)", "Quanto custa plays no spotify?");
  await test("Preço solicitado", "Me manda a tabela de preços");
  await test("Fechamento", "Ok, quero esse de 49,90");
  await test("Suporte", "Meu pedido 12345 não chegou");
  await test("Áudio", "[Áudio] Quero saber o preço");
}

run();
