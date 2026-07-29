import { runAgentV3Turn } from './orchestrator.server';

async function test() {
  console.log("Iniciando teste emergencial do orquestrador V3 (FIXED)...");
  try {
    const result = await runAgentV3Turn({
      workspaceId: 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa',
      chatId: '5511970116430@c.us',
      message: 'Olá, qual o preço do spotify?',
      customerPhone: '5511970116430',
      customerName: 'Teste Emergencia',
      history: [] // Garantindo history inicializado
    });
    console.log("SUCESSO:", JSON.stringify(result, null, 2));
  } catch (err: any) {
    console.error("FALHA CRITICA:", err.message);
  }
}
test();
