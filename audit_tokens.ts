
import { buildSystemPrompt } from "./src/lib/ai.server";
import { mergeIdentity } from "./src/lib/agent-identity.server";

const mockAgent = {
  agent_name: "Júlia",
  tone: "consultivo, humano, natural, confiante",
  base_instruction: "Você é a Júlia da Mind SMM.",
  script_frio: "",
  script_inativo: "",
  script_ativo: "",
  main_offer: "",
  panel_link: "mindsmmpanel.com",
};

const mockContact = {
  nome: "Cliente",
  perfil: "ativo" as const,
};

function estimateTokens(text: string | any[]): number {
  const fullText = Array.isArray(text) ? text.map(t => t.text).join("\n") : text;
  return Math.ceil(fullText.length / 4);
}

const scenarios = [
  { name: "a) Saudação pura", msg: "boa tarde" },
  { name: "b) Pergunta 1 rede", msg: "quanto custa Spotify" },
  { name: "c) Conversa complexa", msg: "achei caro o Spotify, como faço pra pagar no pix?" },
];

scenarios.forEach(s => {
  const prompt = buildSystemPrompt({
    agent: mockAgent,
    contact: mockContact,
    history: [{ sender: "cliente", body: s.msg }],
    isInbound: true,
  });
  console.log(`${s.name}: ${estimateTokens(prompt)} tokens (${Array.isArray(prompt) ? prompt.map(p => p.text.length).reduce((a, b) => a + b, 0) : prompt.length} chars)`);
});
