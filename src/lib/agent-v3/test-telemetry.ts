
import { runAgentV3Turn } from "./orchestrator.server";
import { supabase } from "../../integrations/supabase/client";

async function main() {
  const userId = "f8da521a-e8db-4efe-8c9b-9bd69749c0a7";
  
  // No Bun environment inside sandbox, we might need to fetch from DB
  const { data: integ } = await supabase
    .from("integrations")
    .select("anthropic_api_key")
    .eq("user_id", userId)
    .maybeSingle();

  const apiKey = integ?.anthropic_api_key;

  if (!apiKey) {
    console.error("Could not find Anthropic API key in DB for user", userId);
    process.exit(1);
  }

  const messages = ["Boa noite", "Quero comprar plays"];
  const history: any[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    console.log(`\n--- CHAMADA ${i + 1}: ${msg} ---`);
    const result = await runAgentV3Turn({
      userId,
      message: msg,
      history: history,
      anthropicApiKey: apiKey,
      messageId: `manual-test-${Date.now()}-${i}`,
      inputKind: "texto"
    });
    
    // Atualiza histórico para a próxima chamada
    history.push({ role: "customer", content: msg });
    history.push({ role: "agent", content: result.replies.join("\n\n") });
    
    console.log(`Resposta Agent: ${result.replies.join("\n\n")}`);
  }
}

main().catch(console.error);
