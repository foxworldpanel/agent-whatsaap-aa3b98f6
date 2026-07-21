import { runAgentV3Turn } from "./src/lib/agent-v3/orchestrator.server";
import { supabaseAdmin } from "./src/integrations/supabase/client.server";

const workspaceId = "bd59fa41-d68d-4ac8-b995-e09ae48f52aa";
const userId = "f8da521a-e8db-4efe-8c9b-9bd69749c0a7";

async function validate() {
  console.log("--- INICIANDO VALIDAÇÃO FINAL ---");

  // 1. Verificar se existem módulos no banco
  const { data: dbModules } = await supabaseAdmin
    .from("agent_modules_v3")
    .select("key, content, origin:name") // name used as origin in mock but usually we just want content
    .eq("workspace_id", workspaceId);

  console.log(`Módulos no banco: ${dbModules?.length || 0}`);

  // 2. Testar execução com Haiku 4.5
  const result = await runAgentV3Turn({
    userId,
    message: "Quero comprar 5 mil plays no Spotify",
    history: [],
    anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
    inputKind: "texto"
  });

  console.log("\n--- ANÁLISE DO PROMPT REAL ---");
  const prompt = JSON.stringify(result.rawPrompt);
  
  const modulesInPrompt = (result.modules.selected_keys || []);
  console.log("Módulos selecionados:", modulesInPrompt);

  let allDatabase = true;
  modulesInPrompt.forEach(key => {
    const isInPrompt = prompt.includes(`[MODULE: ${key} | origin: database`);
    console.log(`- ${key}: ${isInPrompt ? "DATABASE ✅" : "FALLBACK ❌"}`);
    if (!isInPrompt) allDatabase = false;
  });

  console.log("\n--- RESULTADO FINAL ---");
  if (allDatabase && modulesInPrompt.length > 0) {
    console.log("STATUS: 100% MIGRADO ✅");
  } else {
    console.log("STATUS: INCONSISTENTE ❌");
  }

  // Comprovação de Hash (Simulada via conteúdo do prompt vs DB)
  console.log("\n--- COMPARAÇÃO DE CONTEÚDO (HASH) ---");
  dbModules?.forEach(m => {
    if (modulesInPrompt.includes(m.key)) {
      const match = prompt.includes(m.content);
      console.log(`${m.key}: ${match ? "MATCH ✅" : "MISMATCH ❌"}`);
    }
  });
}

validate();
