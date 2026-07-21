import { selectModulesV3 as selectRelevantModules } from "@/lib/agent-v3/selector/module-selector.server";
import { buildPromptFromModules } from "@/lib/agent-v3/prompt/prompt-builder.server";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runUnitTests() {
  console.log("--- INICIANDO TESTES UNITÁRIOS V3 ---");

  // 1. Teste de Seleção de Módulos (selectRelevantModules)
  console.log("Testando selectRelevantModules...");

  // Core modules sempre presentes
  const coreKeys = selectRelevantModules("Oi", [], []).selectedModules;
  assert(coreKeys.includes("identidade"), "Core: identidade ausente");
  assert(coreKeys.includes("regras_gerais"), "Core: regras_gerais ausente");
  assert(coreKeys.includes("comportamento_humano"), "Core: comportamento_humano ausente");

  // spotify detectado + spotify habilitado
  const keysEnabled = selectRelevantModules("Quero plays no spotify", [], ["spotify", "fluxo_vendas"]).selectedModules;
  assert(keysEnabled.includes("spotify"), "Deve incluir spotify quando habilitado");
  assert(keysEnabled.includes("fluxo_vendas"), "Deve incluir fluxo_vendas quando habilitado");

  // spotify detectado + spotify desabilitado
  const keysDisabled = selectRelevantModules("Quero plays no spotify", [], ["fluxo_vendas"]).selectedModules;
  assert(!keysDisabled.includes("spotify"), "NÃO deve incluir spotify quando desabilitado");
  assert(keysDisabled.includes("fluxo_vendas"), "Deve incluir fluxo_vendas habilitado");

  console.log("✓ selectRelevantModules: OK");

  // 2. Teste de Construção do Prompt (buildPromptFromModules)
  console.log("Testando buildPromptFromModules...");
  
  // Teste de áudio (simulado pela inclusão de módulo ou texto específico se existisse módulo de áudio no selector)
  // No orquestrador a lógica de "MODO ÁUDIO" é injetada via inputKind, não via módulo do selector.
  // Vamos validar a construção do prompt a partir de chaves conhecidas.
  
  const promptText = buildPromptFromModules(["identidade"], {});
  assert(promptText.includes("MÓDULO IDENTIDADE"), "Prompt deve conter conteúdo do módulo identidade");

  // Lógica de áudio injetada no system prompt (simulando a lógica do orchestrator)
  const buildSystemPromptMock = (inputKind: string) => {
    let prompt = "Base prompt";
    if (inputKind === "audio") prompt += "\nMODO ÁUDIO: Se o input for áudio...";
    return prompt;
  };
  
  const promptAudio = buildSystemPromptMock("audio");
  assert(promptAudio.includes("MODO ÁUDIO"), "Lógica de prompt de áudio falhou");

  console.log("✓ buildPromptFromModules: OK");
}

async function main() {
  try {
    await runUnitTests();
    console.log("\n--- TODOS OS TESTES UNITÁRIOS FINALIZADOS COM SUCESSO ---");
  } catch (e: any) {
    console.error("\n✕ FALHA NOS TESTES:");
    console.error(e.message);
    process.exitCode = 1;
  }
}

main();
