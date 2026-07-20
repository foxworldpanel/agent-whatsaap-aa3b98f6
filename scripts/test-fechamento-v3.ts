import { runAgentV3Turn } from '../src/lib/agent-v3/orchestrator.server';

async function testFechamento() {
  const history = [
    { role: 'user', content: 'Quanto custa 1000 seguidores no Instagram?' },
    { role: 'agent', content: '[TEMP:morno] [INTENT:preco] [STAGE:venda] O pacote de 1000 seguidores brasileiros está saindo por R$ 49,90. É entrega imediata e com garantia.' }
  ];

  const inputs = [
    "esse pacote de 49,90",
    "quero esse",
    "blz",
    "Ok"
  ];

  console.log("--- INICIANDO TESTE REAL MODO FECHAMENTO (V3) ---");
  
  for (const msg of inputs) {
    try {
      console.log(`\n> Cliente: "${msg}"`);
      const result = await runAgentV3Turn({
        userId: 'bd59fa41-d55c-449e-b8d4-8d48a1d7c35f', // Mind Workspace
        message: msg,
        history: history,
        enabledModules: ['instagram', 'pagamentos'],
      });
      
      console.log(`Resposta: "${result.replies.join(' ')}"`);
      console.log(`Intent: ${result.intent} | Stage: ${result.stage}`);
      
      const hasLink = /painel|link|site|cadastro|app\.mind/i.test(result.replies.join(' '));
      if (hasLink) {
        console.log("✅ RESULTADO: Avançou para o fechamento (contém link/painel).");
      } else {
        console.log("❌ RESULTADO: Não avançou claramente para o fechamento.");
      }
    } catch (e) {
      console.error("Erro na chamada:", e);
    }
  }
}

testFechamento();
