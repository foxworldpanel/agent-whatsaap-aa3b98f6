import { buildPromptV2 } from "./prompt-builder";
import { routeModulesV2 } from "./router";
import { createInitialConversationStateV2 } from "./conversation-state";
import { runAgentV2Turn } from "./orchestrator";

/**
 * Teste de Conflito de Catálogo
 * Garante que o catálogo dinâmico prevalece sobre qualquer instrução estática.
 */
async function testCatalogConflict() {
  console.log("🧪 Iniciando Teste de Conflito de Catálogo...");

  const workspaceId = "bd59fa41-591e-4589-9e8c-576f39694761"; // Mind Workspace
  const conversationId = "test-conflict-" + Date.now();
  
  const initialState = createInitialConversationStateV2({
    workspaceId,
    conversationId,
    phoneNumber: "5511999999999"
  });

  // CENÁRIO 1: Serviço Ativo no Catálogo (Deve ignorar qualquer "em atualização")
  const activeCatalog = [
    { service_id: "2269", name: "Spotify - Plays + Ouvintes [GLOBAL]", rate: "15.00", min: "1000", status: "active" }
  ];

  const inputActive: any = {
    workspaceId,
    conversationId,
    phoneNumber: "5511999999999",
    currentMessage: "Vocês tem 1000 plays e ouvintes global no Spotify?",
    previousState: initialState,
    mode: 'receptive',
    executionMode: 'isolated', // Usa simulação controlada no orchestrator
    toolFixtures: {
      catalog: activeCatalog
    }
  };

  const outputActive = await runAgentV2Turn(inputActive);
  
  const hasDisabledMessage = outputActive.reply.toLowerCase().includes("atualização") || 
                             outputActive.reply.toLowerCase().includes("manutenção") ||
                             outputActive.reply.toLowerCase().includes("indisponível");

  console.log(hasDisabledMessage ? "❌ FALHA: Agente informou indisponibilidade mesmo com serviço no catálogo." : "✅ SUCESSO: Agente ofereceu o serviço ativo.");
  console.log("Resposta:", outputActive.reply);

  // CENÁRIO 2: Preço no Catálogo vs Preço Fixo (Deve usar o preço do catálogo)
  const priceCatalog = [
    { service_id: "123", name: "YouTube Views", rate: "25.00", min: "100", status: "active" }
  ];

  const inputPrice: any = {
    ...inputActive,
    currentMessage: "Quanto custa o YouTube?",
    toolFixtures: {
      catalog: priceCatalog
    }
  };

  const outputPrice = await runAgentV2Turn(inputPrice);
  const hasCorrectPrice = outputPrice.reply.includes("25.00") || outputPrice.reply.includes("25,00");

  console.log(hasCorrectPrice ? "✅ SUCESSO: Preço extraído do catálogo." : "❌ FALHA: Preço incorreto na resposta.");
  console.log("Resposta:", outputPrice.reply);

  // CENÁRIO 3: Serviço Inativo (Deve informar indisponibilidade)
  const emptyCatalog: any[] = [];
  const inputEmpty: any = {
    ...inputActive,
    currentMessage: "Tem playlist Spotify?",
    toolFixtures: {
      catalog: emptyCatalog
    }
  };

  const outputEmpty = await runAgentV2Turn(inputEmpty);
  const isUnavailable = outputEmpty.reply.toLowerCase().includes("indisponível") || 
                        outputEmpty.reply.toLowerCase().includes("manutenção") ||
                        outputEmpty.reply.toLowerCase().includes("momento");

  console.log(isUnavailable ? "✅ SUCESSO: Informou indisponibilidade para catálogo vazio." : "❌ FALHA: Ofereceu serviço sem catálogo.");
  console.log("Resposta:", outputEmpty.reply);
}

testCatalogConflict().catch(console.error);
