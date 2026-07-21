import { getValidationAudit } from './src/lib/agent-v3/audit.functions';
import { runAgentV3Turn } from './src/lib/agent-v3/orchestrator.server';
import { supabaseAdmin } from './src/integrations/supabase/client.server';

async function audit() {
  console.log("--- STAGE 1 & 2: Modules & Analysis ---");
  const auditData = await getValidationAudit();
  console.log(JSON.stringify(auditData.modulesList, null, 2));

  console.log("\n--- STAGE 6: Test Selector ---");
  const tests = [
    { name: "Bom dia", msg: "Bom dia" },
    { name: "Spotify Purchase", msg: "Quero comprar 5 mil plays no Spotify" },
    { name: "Security", msg: "É seguro? Precisa da minha senha?" },
    { name: "Support", msg: "Meu pedido caiu e eu preciso de reposição" },
    { name: "Pix Issue", msg: "Não consigo pagar pelo Pix" },
    { name: "Followers", msg: "Quero seguidores" },
    { name: "Context", msg: "Quero 10 mil", prev: "Quero plays no Spotify" }
  ];

  for (const test of tests) {
    console.log(`Testing: ${test.name} (${test.msg})`);
    // Mock conversation state if context is needed
    const result = await runAgentV3Turn({
      message: test.msg,
      conversationId: "audit-test-" + Date.now(),
      workspaceId: auditData.workspaceId,
      inputKind: "text"
    });
    console.log(JSON.stringify({
      intent: result.intelligence.intent,
      modules: result.selected_modules,
      usage: result.run.usage,
      cost: result.run.cost
    }, null, 2));
  }
}

// audit().catch(console.error);
