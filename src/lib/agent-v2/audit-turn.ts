import { runAgentV2Turn } from './orchestrator';
import { AgentV2E2EInput } from './orchestrator.types';

async function auditTest() {
  const workspaceId = 'bd59fa41-d5d2-4f36-96a8-a3411784962d';
  const phone = '5511999999999';

  const input: AgentV2E2EInput = {
    workspaceId,
    conversationId: 'audit-test-conv',
    phoneNumber: phone,
    currentMessage: 'Vocês têm 1.000 plays e ouvintes globais no Spotify? Qual o valor?',
    mode: 'receptive',
    previousState: {
      workspaceId,
      conversationId: 'audit-test-conv',
      phoneNumber: phone,
      mode: 'receptive',
      network: 'spotify',
      service: 'playlist',
      intent: 'price',
      currentStep: 'presenting_solution',
      customer: { hasAccount: false, hasBalance: false },
      payment: {},
      freeTest: { status: 'none' },
      tutorial: { active: false },
      support: { active: false },
      toolsUsed: [],
      loadedModules: [],
      facts: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    shortHistory: [],
    toolFixtures: {
      catalog: [
        {
          service: 2269,
          name: 'Spotify - Plays + Ouvintes [GLOBAL]',
          rate: 15.00,
          min: 1000,
          status: 'active'
        }
      ]
    },
    executionMode: 'real' 
  };

  console.log('--- INICIANDO AUDITORIA DE PROMPT V2 ---');
  try {
    const output = await runAgentV2Turn(input);
    console.log('TURN ID:', output.metrics.analytics?.turnId);
    console.log('REPLY:', output.finalResponse);
    console.log('MODULES:', output.routeResult.selectedModules);
    
    if (output.promptBuildResult) {
       console.log('PROMPT SYSTEM (FRAGMENTO):', output.promptBuildResult.systemPrompt.slice(0, 500));
       const leak = output.finalResponse.includes("atualização") || output.finalResponse.includes("plays e ouvintes");
       console.log('LEAK DETECTED:', leak ? 'SIM' : 'NÃO');
       
       if (leak) {
         console.log('--- PROMPT COMPLETO PARA ANÁLISE ---');
         console.log(output.promptBuildResult.systemPrompt);
       }
    } else {
       console.log('PROMPT NULL - Short answer resolution used?');
       console.log('Resolved:', output.shortAnswerResolution?.resolved);
    }
  } catch (err) {
    console.error('ERRO NO TESTE:', err);
  }
}

auditTest();

