
import { testV3Agent } from "./src/lib/agent-v3/test-v3.functions";

async function runTest() {
  console.log("--- TESTE 1: Boa noite ---");
  const res1 = await testV3Agent({ data: { message: "Boa noite", history: [] } });
  console.log("Replica 1:", res1.replies);
  
  console.log("\n--- TESTE 2: Quero comprar plays ---");
  const res2 = await testV3Agent({ data: { message: "quero comprar plays", history: [{ role: "customer", content: "Boa noite" }, { role: "agent", content: res1.replies[0] }] } });
  console.log("Replica 2:", res2.replies);
}

runTest().catch(console.error);
