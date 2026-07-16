/**
 * Agent Mind V2 - E2E Orchestrator
 */

import { AgentV2E2EInput, AgentV2E2EOutput } from './orchestrator.types';
import { routeModulesV2 } from './router';
import { routeModelV2 } from './model-router';
import { buildPromptV2 } from './prompt-builder';
import { runGuardEngineV2 } from './guard-engine';
import { ConversationStateV2, V2StateEvent } from './conversation-state.types';
import { RouteModulesV2Output } from './router.types';
import { determineCustomerStage, calculateQualityScores, calculateEstimatedCost } from './analytics';
import { AgentV2TurnAnalytics, QualityFlags } from './analytics.types';


/**
 * Executes a full Agent Mind V2 turn in an isolated environment.
 */
export async function runAgentV2Turn(input: AgentV2E2EInput): Promise<AgentV2E2EOutput> {
  const startTime = Date.now();
  const errors: string[] = [];
  const metrics: Record<string, any> = {
    brainVersion: '2.0.0',
    executionMode: input.executionMode,
    durationMs: 0
  };

  // A. Normalizar a mensagem
  const normalizedMessage = input.currentMessage.trim();

  // B. Tentar resolver resposta curta pelo estado (Simulação de determinismo no Model Router)
  // O model router já faz isso, mas aqui centralizamos o fluxo
  const stateBefore = { ...input.previousState };

  // C. Executar Module Router
  const routeResult = routeModulesV2({
    currentMessage: normalizedMessage,
    conversationState: stateBefore
  });

  // D. Aplicar stateEvents (Simplificado para o orchestrator)
  let stateAfterRouting = applyStateEvents(stateBefore, routeResult.stateEvents);

  // E. Executar Model Router
  const modelRouteResult = routeModelV2({
    currentMessage: normalizedMessage,
    conversationState: stateAfterRouting,
    routeResult,
    hasAudio: input.media?.hasAudio,
    hasImage: input.media?.hasImage
  });

  let finalResponse = "";
  let promptBuildResult = null;
  let guardResult = null;
  let modelResponse = null;
  let regenerationResult = null;
  let shortAnswerResolution = null;

  // F. Se useLlm=false
  if (!modelRouteResult.useLlm) {
    shortAnswerResolution = { resolved: true, response: generateDeterministicResponse(normalizedMessage, stateAfterRouting, routeResult) };
    finalResponse = shortAnswerResolution.response || "Entendido. Como posso ajudar?";
    
    // Guard Engine ainda é aplicado em respostas determinísticas
    guardResult = runGuardEngineV2({
      draftResponse: finalResponse,
      conversationState: stateAfterRouting,
      routeResult,
      modelRouteResult,
      selectedModules: routeResult.selectedModules,
      selectedTools: routeResult.selectedTools,
      toolResults: input.toolFixtures,
      currentMessage: normalizedMessage,
      executionMode: input.executionMode
    });
    finalResponse = guardResult.finalResponse;
  } 
  // G. Se useLlm=true
  else {
    // Montar Prompt Builder
    promptBuildResult = buildPromptV2({
      conversationState: stateAfterRouting,
      routeResult,
      history: input.shortHistory,
      historySummary: input.historySummary,
      toolResults: input.toolFixtures,
      currentMessage: normalizedMessage,
      brainVersion: '2.0.0',
      builderVersion: '2.0.0'
    });

    // Chamar o modelo (SIMULADO PARA E2E)
    modelResponse = await simulateModelCall(promptBuildResult, modelRouteResult.selectedModel || 'claude-3-haiku-20240307');

    // H. Aplicar Guard Engine
    guardResult = runGuardEngineV2({
      draftResponse: modelResponse,
      conversationState: stateAfterRouting,
      routeResult,
      modelRouteResult,
      selectedModules: routeResult.selectedModules,
      selectedTools: routeResult.selectedTools,
      toolResults: input.toolFixtures,
      currentMessage: normalizedMessage,
      executionMode: input.executionMode
    });

    finalResponse = guardResult.finalResponse;

    // I. Se requiresRegeneration=true
    if (guardResult.requiresRegeneration) {
      const instruction = guardResult.regenerationInstruction || "Corrija a resposta anterior.";
      // Nova chamada (Regeneração)
      const regenResponse = await simulateModelCall(promptBuildResult, modelRouteResult.selectedModel || 'claude-3-haiku-20240307', instruction);
      
      const regenGuardResult = runGuardEngineV2({
        draftResponse: regenResponse,
        conversationState: stateAfterRouting,
        routeResult,
        modelRouteResult,
        selectedModules: routeResult.selectedModules,
        selectedTools: routeResult.selectedTools,
        toolResults: input.toolFixtures,
        currentMessage: normalizedMessage,
        executionMode: input.executionMode
      });

      regenerationResult = {
        instruction,
        modelResponse: regenResponse,
        guardResult: regenGuardResult
      };

      finalResponse = regenGuardResult.finalResponse;
      
      // J. Se continuar inválida (Bloqueio)
      if (regenGuardResult.blocked) {
         finalResponse = "Desculpe, não consegui processar sua solicitação corretamente. Pode repetir?";
      }
    } else if (guardResult.blocked) {
      finalResponse = "Desculpe, tive um problema interno. Como posso ajudar?";
    }
  }

  // K. Atualizar o estado final
  let stateAfter = { ...stateAfterRouting };
  
  if (errors.length === 0) {
    stateAfter = { 
      ...stateAfterRouting, 
      lastAnswer: finalResponse,
      updatedAt: new Date().toISOString()
    };
  }

  // L. Registrar métricas
  metrics.durationMs = Date.now() - startTime;
  metrics.intent = routeResult.detectedIntent;
  metrics.usedLlm = modelRouteResult.useLlm;
  metrics.selectedModel = modelRouteResult.selectedModel;
  metrics.guardViolations = (guardResult?.violations.length || 0) + (regenerationResult?.guardResult.violations.length || 0);
  metrics.regenerationCount = regenerationResult ? 1 : 0;
  
  // Persistência simulada (E2E Hardening)
  try {
    if (metrics.durationMs > 0) metrics.persisted = true;
  } catch (e) {
    errors.push("Erro ao persistir métricas.");
  }

  return {
    stateBefore,
    shortAnswerResolution,
    routeResult,
    stateAfterRouting,
    modelRouteResult,
    promptBuildResult,
    modelResponse,
    guardResult,
    regenerationResult,
    finalResponse,
    stateAfter,
    metrics,
    errors,
    sentToCustomer: false
  };
}

function applyStateEvents(state: ConversationStateV2, events: V2StateEvent[]): ConversationStateV2 {
  let newState = { ...state };
  for (const event of events) {
    switch (event.type) {
      case 'mode_detected': newState.mode = event.value; break;
      case 'network_detected': newState.network = event.value; break;
      case 'intent_detected': newState.intent = event.value; break;
      case 'step_changed': newState.currentStep = event.value; break;
      case 'question_asked': newState.lastQuestion = event.value; break;
      case 'customer_account_known': newState.customer.hasAccount = event.value; break;
      case 'service_detected': newState.service = event.value; break;
      case 'quantity_detected': newState.quantity = event.value; break;
      case 'free_test_accepted': newState.freeTest.status = 'accepted'; break;
      case 'free_test_waiting_link': newState.freeTest.status = 'waiting_link'; break;
      case 'free_test_started': newState.freeTest.status = 'started'; break;
      case 'free_test_completed': newState.freeTest.status = 'completed'; break;
      case 'conversation_closed': newState.currentStep = 'conversation_closed'; break;
    }
  }
  return newState;
}

function generateDeterministicResponse(message: string, state: ConversationStateV2, route: RouteModulesV2Output): string {
  const msg = message.toLowerCase();
  const lastQ = state.lastQuestion?.toLowerCase() || "";

  if (['sim', 'não', 'nao'].includes(msg)) {
    if (lastQ.includes('cadastro') || lastQ.includes('conta')) {
      return msg === 'sim' 
        ? "Ótimo! Vou te orientar como acessar seu painel." 
        : "Sem problemas. Para comprar, você precisará criar uma conta rapidinho no painel. Posso te enviar o link?";
    }
  }

  if (state.intent === 'support') {
    return "Para analisar esse caso, abra um ticket no suporte do painel. Por lá a equipe consegue acessar os dados do pedido.";
  }

  if (state.intent === 'goodbye') {
    return "Por nada! Se precisar de mais alguma coisa, estarei por aqui. Tenha um ótimo dia!";
  }

  return "Entendido. Como posso prosseguir?";
}

async function simulateModelCall(prompt: any, model: string, instruction?: string): Promise<string> {
  const lastUserMessage = prompt.messages[prompt.messages.length - 1].content.toLowerCase();
  const stateSummary = prompt.systemPrompt.toLowerCase();

  // Simulação de resposta com base na intenção e estado
  if (instruction) {
    if (instruction.includes('PRICE_SOURCE_GUARD') || instruction.includes('Confusão entre playlist e seguidores')) {
      if (stateSummary.includes('playlist')) {
        return "A nossa playlist para Spotify está custando apenas R$ 49,90. É uma excelente forma de ganhar visibilidade!";
      }
    }
  }

  if (lastUserMessage.includes('divulgar minha música')) {
    return "Claro! Em qual plataforma você deseja divulgar? Trabalhamos com Spotify, YouTube e várias outras.";
  }
  if (lastUserMessage.includes('spotify') && !stateSummary.includes('rede: spotify')) {
    return "Ótima escolha! Para o Spotify, você busca seguidores para o seu perfil ou plays em uma playlist específica?";
  }
  if (lastUserMessage.includes('playlist')) {
    return "Perfeito. As nossas playlists do Spotify são de alta qualidade. Gostaria de saber os preços?";
  }
  if (lastUserMessage.includes('quanto custa')) {
    return "A nossa playlist para Spotify está custando apenas R$ 49,90. Quantas você gostaria de contratar?";
  }
  if (lastUserMessage.includes('vamos fechar')) {
    return "Excelente! Você já possui cadastro no nosso painel de pedidos?";
  }
  if (lastUserMessage.includes('medo de comprar')) {
    return "Entendo perfeitamente sua preocupação. Para você ver como o sistema funciona na prática, eu posso liberar um teste grátis para você. O que acha?";
  }
  if (lastUserMessage.includes('quero') && !stateSummary.includes('teste grátis: offered')) {
    return "Combinado! Para ativar seu teste, por favor, me envie o link da sua música ou perfil do Spotify.";
  }
  if (lastUserMessage.includes('spotify.com')) {
    return "Link recebido! Já solicitei o seu teste grátis aqui no sistema. Agora é só aguardar um pouquinho que ele será processado.";
  }
  
  if (stateSummary.includes('rede: spotify')) {
    if (stateSummary.includes('serviço: playlist')) {
      return "Deseja contratar a playlist para Spotify agora?";
    }
    return "Qual serviço do Spotify você deseja?";
  }

  return "Como posso te ajudar com nossos serviços hoje?";
}
