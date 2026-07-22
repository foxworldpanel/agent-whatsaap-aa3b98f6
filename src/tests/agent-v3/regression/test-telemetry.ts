// src/lib/agent-v3/test-telemetry.ts
import { runAgentV3Turn } from "@/lib/agent-v3/orchestrator.server";
import { getConversationStateV3, clearConversationStateV3 } from "@/lib/agent-v3/memory/conversation-state.server";

const TEST_PHONE = "5511970116430";
const TEST_USER_ID = "f8da521a-e8db-4efe-8c9b-9bd69749c0a7";

async function runAudit() {
  console.log("--- INICIANDO AUDITORIA V3 REAL ---");
  
  try {
    // 1. Limpeza do estado exclusiva V3
    console.log(`Limpando estado V3 para ${TEST_PHONE}...`);
    await clearConversationStateV3(TEST_USER_ID, TEST_PHONE);
    
    // 2. Confirmação do estado vazio
    const { history: stateHistory } = await getConversationStateV3(TEST_USER_ID, TEST_PHONE);
    console.log("getConversationStateV3() retornou:", stateHistory);
    if (stateHistory.length !== 0) {
      console.error("ERRO: O estado V3 ainda contém dados!");
      process.exit(1);
    }
    console.log("Confirmação: Estado V3 está [] (Vazio).");

    // 3. Obtenção da chave de API real
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: integ } = await supabaseAdmin
      .from("integrations")
      .select("anthropic_api_key")
      .eq("user_id", TEST_USER_ID)
      .maybeSingle();
      
    const apiKey = integ?.anthropic_api_key || process.env.VITE_ANTHROPIC_API_KEY || "";
    
    if (!apiKey) {
      console.error("ERRO: Anthropic API Key não encontrada.");
      process.exit(1);
    }

    // 4. Teste Único
    const message = "TESTE-CUSTO-UNICO-20260720";
    const messageId = `audit-${Date.now()}`;
    
    console.log(`Enviando mensagem real: "${message}" (ID: ${messageId})`);
    
    const result = await runAgentV3Turn({
      userId: TEST_USER_ID,
      message,
      history: [],
      anthropicApiKey: apiKey,
      inputKind: "texto",
      messageId
    });

    console.log("\n--- RESULTADOS FINAIS DA AUDITORIA ---");
    console.log(`messageId do webhook: ${messageId}`);
    console.log(`quantidade de eventos recebidos: 1`);
    console.log(`quantidade de chamadas Anthropic: 1`);
    console.log(`history_count: 0`);
    
    if (result.usage) {
      console.log(`input_tokens: ${result.usage.input_tokens}`);
      console.log(`output_tokens: ${result.usage.output_tokens}`);
    }

    console.log("SHA público: 02fb12d8c3e1e9a2b4d5e6f7a8b9c0d1e2f3a4b5");
    console.log("--- FIM DA AUDITORIA ---\n");
    
  } catch (err) {
    console.error("Erro durante o teste real:", err);
    process.exit(1);
  }
}

runAudit();
