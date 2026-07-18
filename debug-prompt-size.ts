import { buildSystemPrompt, selectActiveModules } from "./src/lib/ai.server";
import { DEFAULT_IDENTITY, buildSharedRules } from "./src/lib/agent-identity.server";

import { DEFAULT_MODULES } from "./src/lib/agent-modules";

const prompt = buildSystemPrompt({
  agent: {
    id: "test",
    workspace_id: "bd59fa41-d68d-4ac8-b995-e09ae48f52aa",
    identity: DEFAULT_IDENTITY,
    modules: DEFAULT_MODULES,
    modules_enabled: {},
    config: {
      active_modules: ["identidade", "pagamentos", "fluxo_vendas", "regras_proibidas", "comportamento_humano", "texto_ou_audio", "regras_gerais"]
    }
  },
  contact: { phone: "5511970116430", perfil: "receptivo" },
  history: [{ sender: "cliente", body: "preciso de suporte" }],
});

const activeModules = selectActiveModules(
  DEFAULT_MODULES,
  {},
  "preciso de suporte"
);
console.log(`Active modules: ${activeModules.map(m => m[0]).join(", ")}`);

console.log(`Prompt length: ${prompt.length} chars`);
console.log(`Estimated tokens: ${Math.ceil(prompt.length / 4)}`);

