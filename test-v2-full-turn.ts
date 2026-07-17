import { runAgentV2Turn } from './src/lib/agent-v2/orchestrator';

async function test() {
  const result = await runAgentV2Turn({
    conversationId: 'test-conv-id',
    workspaceId: 'bd59fa41-3994-4340-9a28-660c63966085',
    phoneNumber: '5511970116430',
    currentMessage: 'Olá',
    mode: 'receptive',
    executionMode: 'real',
    media: { type: 'text' },
    shortHistory: [],
    toolFixtures: { catalog: [], freeTestServices: [] },
    previousState: {
        workspaceId: 'bd59fa41-3994-4340-9a28-660c63966085',
        conversationId: 'test-conv-id',
        phoneNumber: '5511970116430',
        mode: 'receptive',
        network: 'unknown',
        service: 'unknown',
        intent: 'unknown',
        currentStep: 'greeting',
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        customer: { hasAccount: false, hasBalance: false },
        payment: {},
        freeTest: { status: 'none' },
        tutorial: { active: false },
        support: { active: false },
        toolsUsed: [],
        loadedModules: ['mission', 'identity', 'guards'],
        facts: {}
    }
  });

  console.log('\n--- V2 TURN RESULT ---');
  console.log('Final Response:', result.finalResponse);
  console.log('Errors:', JSON.stringify(result.errors, null, 2));
}

test().catch(console.error);
