import { buildPromptV2 } from './prompt-builder';

const scenarios = [
  { name: "Boa tarde", message: "Boa tarde" },
  { name: "Vocês trabalham com o quê?", message: "Vocês trabalham com o quê?" },
  { name: "Spotify", message: "Spotify" },
  { name: "Meu pedido caiu", message: "Meu pedido caiu" },
  { name: "Obrigado", message: "Obrigado" }
];

scenarios.forEach(s => {
  const result = buildPromptV2({
    currentMessage: s.message,
    history: [],
    state: {},
    mode: 'receptive',
    selectedModules: []
  });
  
  console.log("=== Cenario: " + s.name + " ===");
  console.log("Tokens: " + result.estimatedTokens);
  console.log("---");
});
