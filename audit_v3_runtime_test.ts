import { runAgentV3Turn } from './src/lib/agent-v3/orchestrator.server';

async function test() {
  try {
    const result = await runAgentV3Turn({
      userId: "bd59fa41-d68d-4ac8-b995-e09ae48f52aa", // Using workspace owner user_id or similar
      message: "Quero comprar 5 mil plays no Spotify",
      history: [],
      inputKind: "texto",
      anthropicApiKey: process.env.ANTHROPIC_API_KEY || ""
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("ERROR_START");
    console.error(err);
    console.error("ERROR_END");
    process.exit(1);
  }
}

test();
