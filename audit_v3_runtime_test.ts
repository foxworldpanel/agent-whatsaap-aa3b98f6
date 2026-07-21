import { runAgentV3Turn } from './src/lib/agent-v3/orchestrator.server';

async function test() {
  const result = await runAgentV3Turn({
    message: "Quero comprar 5 mil plays no Spotify",
    conversationId: "audit-test-real-123",
    workspaceId: "bd59fa41-d68d-4ac8-b995-e09ae48f52aa",
    inputKind: "text"
  });
  console.log(JSON.stringify(result, null, 2));
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});
