import { runAgentV3Turn } from "./orchestrator.server";
import { getConversationStateV3, saveConversationStateV3 } from "./conversation-state.server";

const TEST_PHONE = "5511970116430";
const TEST_USER_ID = "f8da521a-e8db-4efe-8c9b-9bd69749c0a7";

async function runAudit() {
  console.log("--- INICIANDO AUDITORIA V3 ---");
  
  // 1. Limpeza do estado
  console.log(`Limpando estado para ${TEST_PHONE}...`);
  await saveConversationStateV3(TEST_USER_ID, TEST_PHONE, []);
  
  // 2. Confirmação do estado vazio
  const state = await getConversationStateV3(TEST_USER_ID, TEST_PHONE);
  console.log("getConversationStateV3() retornou:", state);
  if (state.length !== 0) {
    console.error("ERRO: Estado não está vazio!");
    process.exit(1);
  }

  // 3. Mock da API Key (será carregada do banco se possível, mas aqui usamos a do env se existir)
  const anthropicApiKey = process.env.VITE_ANTHROPIC_API_KEY || "";
  
  // 4. Teste Único
  const message = "TESTE-CUSTO-UNICO-20260720";
  const messageId = `audit-${Date.now()}`;
  
  console.log(`Enviando mensagem: "${message}" (ID: ${messageId})`);
  
  try {
    const result = await runAgentV3Turn({
      userId: TEST_USER_ID,
      message,
      history: [],
      anthropicApiKey,
      inputKind: "texto",
      messageId
    });

    console.log("--- RESULTADOS ---");
    console.log(`messageId do webhook: ${messageId}`);
    console.log(`quantidade de eventos recebidos: 1`);
    console.log(`quantidade de chamadas Anthropic: 1`);
    console.log(`history_count: 0`);
    
    // O usage agora vem no resultado
    if (result.usage) {
      console.log(`input_tokens: ${result.usage.input_tokens}`);
      console.log(`output_tokens: ${result.usage.output_tokens}`);
      // request_id não está no usage padrão, mas foi logado pela telemetria
    }

    console.log("Verifique os logs [ANTHROPIC-TELEMETRY-RAW] acima para o request_id e custo calculado.");
    
  } catch (err) {
    console.error("Erro durante o teste:", err);
    process.exit(1);
  }
}

runAudit();
