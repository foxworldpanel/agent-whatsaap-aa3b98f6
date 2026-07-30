import { supabaseAdmin } from '../../integrations/supabase/client.server';
import { runAgentV3Turn } from './orchestrator.server';

async function test() {
  console.log("--- TESTE AGENT V3 DIRECT ---");
  try {
    const result = await runAgentV3Turn({
      userId: '6b567b57-1934-4531-863a-442880753e18', // Mind Admin
      workspaceId: 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa',
      message: 'Olá, qual o preço do spotify?',
      history: [],
      phone: '5511970116430',
      anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
      inputKind: "texto",
      businessDecision: {
        state: "orcamento",
        risk: "normal",
        reason: "teste manual",
        nextAction: "preço",
        allowQualification: true,
        shouldHandoff: false
      }
    });
    console.log("SUCESSO V3:", JSON.stringify(result.replies, null, 2));
  } catch (err: any) {
    console.error("FALHA V3:", err.message);
  }
}
test();
