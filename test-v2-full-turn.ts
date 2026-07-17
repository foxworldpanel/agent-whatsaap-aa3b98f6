import { runAgentV2Turn } from './src/lib/agent-v2/orchestrator';

async function testV2() {
  const input = {
    workspaceId: 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa',
    conversationId: 'test_conv_v2_fix',
    phoneNumber: '5511999999999',
    currentMessage: 'Olá, quais serviços vocês tem para Spotify?',
    previousState: {
      workspaceId: 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa',
      conversationId: 'test_conv_v2_fix',
      phoneNumber: '5511999999999',
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
      loadedModules: [],
      facts: {}
    },
    shortHistory: [],
    mode: 'receptive',
    executionMode: 'production'
  };

  console.log("Starting full V2 turn test...");
  try {
    const result = await (runAgentV2Turn as any)(input);
    console.log("-----------------------------------------");
    console.log(`Final Response: ${result.finalResponse}`);
    console.log(`Model Used: ${result.modelRouteResult?.selectedModel}`);
    console.log(`Status: ${result.errors.length > 0 ? 'FAILED' : 'SUCCESS'}`);
    if (result.errors.length > 0) console.error("Errors:", result.errors);
  } catch (err) {
    console.error("Fatal Test Error:", err);
  }
}

testV2();
