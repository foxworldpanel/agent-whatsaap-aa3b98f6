import { runAgentV3Turn } from './src/lib/agent-v3/orchestrator.server';

async function test() {
  const wsId = "bd59fa41-d68d-4ac8-b995-e09ae48f52aa";
  const userId = "f8da521a-e8db-4efe-8c9b-9bd69749c0a7"; // f8da521a-e8db-4efe-8c9b-9bd69749c0a7 is the user for this workspace

  try {
    const result = await runAgentV3Turn({
      userId: userId,
      message: "Quero comprar 5 mil plays no Spotify",
      history: [],
      inputKind: "texto",
      anthropicApiKey: process.env.ANTHROPIC_API_KEY || ""
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

test();
