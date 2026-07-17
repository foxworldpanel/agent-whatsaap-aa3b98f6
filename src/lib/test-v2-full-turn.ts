import { runAgentV2Turn } from './agent-v2.functions';

/**
 * Script de Teste Real - Turno V2 Completo
 * Tenta simular o que o webhook faz para encontrar a exceção.
 */
async function testFullTurn() {
  const conversationId = '66666666-6666-6666-6666-666666666666'; // ID fictício mas válido UUID
  const workspaceId = 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa'; // Mind Workspace
  const phoneNumber = '5511970116430'; // Número autorizado
  const currentMessage = 'Olá';

  console.log('--- INICIANDO TESTE DE TURNO REAL V2 ---');
  console.log(`Msg: "${currentMessage}" | Phone: ${phoneNumber}`);

  try {
    const result = await runAgentV2Turn({
      correlationId: `test_${Date.now()}`,
      conversationId,
      workspaceId,
      phoneNumber,
      currentMessage,
      executionMode: 'real',
      mode: 'receptive'
    });

    console.log('--- SUCESSO NO ORCHESTRATOR ---');
    console.log('Resposta Final:', result.finalResponse);
    console.log('Correlation ID:', result.metrics.correlationId);
  } catch (error) {
    console.error('--- FALHA NO TESTE ---');
    if (error instanceof Error) {
      console.error('Nome:', error.name);
      console.error('Mensagem:', error.message);
      console.error('Stack:', error.stack);
      if (error.cause) console.error('Causa:', error.cause);
    } else {
      console.error('Erro desconhecido:', error);
    }
  }
}

testFullTurn();
