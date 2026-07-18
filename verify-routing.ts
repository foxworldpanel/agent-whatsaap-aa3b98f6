import { pickClaudeModel } from "./src/lib/ai.server";

console.log("--- Teste de Roteamento ---");

console.log("1. Reengajamento (Gap de tempo):");
const res1 = pickClaudeModel({ hasImage: false, reengagementGreeting: true });
console.log(res1);

console.log("\n2. Texto normal:");
const res2 = pickClaudeModel({ hasImage: false, reengagementGreeting: false, latestMessage: "quanto custa spotify?" });
console.log(res2);

console.log("\n3. Áudio:");
const res3 = pickClaudeModel({ hasImage: false, inputKind: "audio", reengagementGreeting: false });
console.log(res3);

console.log("\n4. Visão (Imagem):");
const res4 = pickClaudeModel({ hasImage: true, reengagementGreeting: false });
console.log(res4);
