import { loadEnabledModulesV3 } from "./modules.server";
import { selectRelevantModules, buildPromptFromModules } from "./module-selector.server";
import { runAgentV3Turn } from "./orchestrator.server";

async function testSprint1() {
  const userId = "bd59fa41-d68d-4ac8-b995-e09ae48f52aa"; // Mind Workspace
  
  console.log("--- TESTE A: Identidade Ativa (Prompt Check) ---");
  // Como o runAgentV3Turn falha na chamada de API, vamos testar os componentes internos
  
  // 1. Simular carga de módulos
  const activeModulesMap = await loadEnabledModulesV3(userId);
  const enabledKeys = Object.keys(activeModulesMap);
  console.log("Módulos no DB/Fallback:", enabledKeys);
  
  // 2. Simular seleção
  const selectedKeys = selectRelevantModules("Quem é você?", enabledKeys);
  console.log("Módulos selecionados para 'Quem é você?':", selectedKeys);
  
  // 3. Simular construção de prompt
  const modulePrompt = buildPromptFromModules(selectedKeys, activeModulesMap as any);
  
  const hasIdentidade = selectedKeys.includes("identidade") || modulePrompt.includes("Júlia");
  console.log("Identidade presente no fluxo de módulos:", hasIdentidade);
  
  console.log("\n--- TESTE D: Busca por Hardcodes no Código ---");
  const orchestratorPromptBase = `
LEAD INTELLIGENCE (Obrigatório em toda resposta):
Sempre inclua os seguintes marcadores no INÍCIO da sua resposta (antes do texto):
[TEMP:frio|morno|quente]
[CONF:Muito baixa|Baixa|Média|Alta|Muito alta]
[INTENT:Saudação|Informação|Pesquisa|Comparação|Compra|Suporte|Pagamento|Pós-venda|Reclamação|Outro]
[STAGE:Primeiro contato|Descoberta|Qualificação|Negociação|Objeções|Fechamento|Pós-venda]
[PROB:0-100]
[SENT:Positivo|Neutro|Negativo]
[URG:Baixa|Média|Alta]
[ACTION:Ação recomendada]
[REASON:Justificativa curta]
[SCORE:0-100] (Avaliação da qualidade da resposta)
[FEEDBACK:Item 1|Item 2|...] (Lista de pontos positivos/negativos separados por |)

ESTADO DA CONVERSA:
  `;

  const hardcodes = ["Júlia", "Julia", "Mind SMM Panel", "atendente comercial", "mindpnl"];
  const found = hardcodes.filter(h => orchestratorPromptBase.toLowerCase().includes(h.toLowerCase()));
  console.log("Hardcodes encontrados no motor fixo (Orchestrator):", found.length > 0 ? found : "NENHUM");
}

testSprint1().catch(console.error);
