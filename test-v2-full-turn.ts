import { runAgentV2Turn } from './src/lib/agent-v2.functions';

async function test() {
  const MIND_ID = 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa';
  console.log('Running V2 turn test with workspace:', MIND_ID);
  
  try {
    const result = await runAgentV2Turn({
      conversationId: 'test-conv-id',
      workspaceId: MIND_ID,
      phoneNumber: '5511999999999',
      currentMessage: 'Olá, gostaria de saber os preços',
      mode: 'receptive',
      executionMode: 'real',
      media: { type: 'text' },
      shortHistory: [],
      toolFixtures: { catalog: [], freeTestServices: [] },
      expected: {
        conversationWorkspaceId: MIND_ID,
        agentWorkspaceId: MIND_ID,
        whatsappWorkspaceId: MIND_ID,
        selectedWorkspaceId: MIND_ID
      }
    });

    console.log('\n--- V2 TURN RESULT ---');
    console.log('Final Response:', result.finalResponse);
    console.log('Errors:', result.errors);
  } catch (err) {
    console.error('CRITICAL TURN ERROR:', err);
  }
}

test();
