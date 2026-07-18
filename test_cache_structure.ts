import { buildSystemPrompt } from "./src/lib/ai.server";
import { DEFAULT_IDENTITY } from "./src/lib/agent-identity.server";

const agent = {
  agent_name: "Júlia",
  tone: "consultivo",
  base_instruction: "Identidade",
  script_frio: "",
  script_inativo: "",
  script_ativo: "",
  main_offer: "",
  panel_link: null
};

const contact = { nome: "Teste", perfil: "frio" as const };

// Simulation 1: Spotify
const history1 = [{ sender: "cliente" as const, body: "quero plays no spotify" }];
const prompt1 = buildSystemPrompt({ agent, contact, history: history1 });

// Simulation 2: YouTube
const history2 = [{ sender: "cliente" as const, body: "quero views no youtube" }];
const prompt2 = buildSystemPrompt({ agent, contact, history: history2 });

const isFirstBlockIdentical = JSON.stringify(prompt1[0]) === JSON.stringify(prompt2[0]);
console.log("\nIs first block (STABLE) identical?", isFirstBlockIdentical);

if (!isFirstBlockIdentical) {
    console.log("DIFFERENCES IN FIRST BLOCK:");
    const t1 = prompt1[0].text;
    const t2 = prompt2[0].text;
    if (t1 !== t2) {
        console.log("Text differs!");
        for (let i = 0; i < Math.min(t1.length, t2.length); i++) {
            if (t1[i] !== t2[i]) {
                console.log(`First diff at char ${i}: "${t1.substring(i, i+20)}" vs "${t2.substring(i, i+20)}"`);
                break;
            }
        }
    }
} else {
    console.log("STABLE BLOCK 1 CONTENT LENGTH:", prompt1[0].text.length);
    console.log("STABLE BLOCK 1 CACHE CONTROL:", JSON.stringify(prompt1[0].cache_control));
}
