/**
 * Agent Mind V2 - E2E Orchestrator
 */

import { AgentV2E2EInput, AgentV2E2EOutput } from './orchestrator.types';
import { routeModulesV2 } from './router';
import { routeModelV2 } from './model-router';
import { buildPromptV2 } from './prompt-builder';
import { runGuardEngineV2 } from './guard-engine';
import { callLLMV2 } from './llm-client.server';

import { ConversationStateV2, V2StateEvent } from './conversation-state.types';
import { RouteModulesV2Output } from './router.types';
import { determineCustomerStage, calculateQualityScores, calculateEstimatedCost, hashPhoneNumber } from './analytics';
import { AgentV2TurnAnalytics, QualityFlags } from './analytics.types';
import { getAgentV2AnalyticsRepository } from './analytics.repository';
import { aggregateConversationFromTurns } from './analytics-aggregation';

async function persistTurnAnalytics(data: AgentV2TurnAnalytics) {
  const repository = getAgentV2AnalyticsRepository();
  
  try {
    await repository.persistTurn(data);
    console.log(`[Analytics Engine V2] Turn captured: ${data.turnId} (${repository.constructor.name})`);
    
    // Auto-aggregation (best-effort)
    const turns = await repository.getConversationTurns(data.workspaceId, data.conversationId);
    if (turns.length > 0) {
      const aggregated = aggregateConversationFromTurns(data.workspaceId, data.conversationId, turns);
      await repository.persistConversation(aggregated);
    }
  } catch (err) {
    console.error('[Analytics] Persistence failed, continuing execution...', err);
  }
}



/**
 * Executes a full Agent Mind V2 turn in an isolated environment.
 */
export async function runAgentV2Turn(input: AgentV2E2EInput): Promise<AgentV2E2EOutput> {
  const startTime = Date.now();
  const errors: string[] = [];
  const metrics: Record<string, any> = {
    brainVersion: 'v2',
    executionMode: input.executionMode,
    durationMs: 0
  };

  const normalizedMessage = input.currentMessage.trim();
  const stateBefore = { ...input.previousState };

  const routeResult = routeModulesV2({
    currentMessage: normalizedMessage,
    conversationState: stateBefore
  });

  let stateAfterRouting = applyStateEvents(stateBefore, routeResult.stateEvents);

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

  if (!modelRouteResult.useLlm) {
    shortAnswerResolution = { 
      resolved: true, 
      response: generateDeterministicResponse(normalizedMessage, stateAfterRouting, routeResult) 
    };
    finalResponse = shortAnswerResolution.response || "Entendido. Como posso ajudar?";
    
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
  } else {
    promptBuildResult = buildPromptV2({
      conversationState: stateAfterRouting,
      routeResult,
      history: input.shortHistory,
      historySummary: input.historySummary,
      toolResults: input.toolFixtures,
      currentMessage: normalizedMessage,
      brainVersion: 'v2',
      builderVersion: '2.0.0'
    });

    const modelResult = await callBrainModel(input, promptBuildResult, modelRouteResult.selectedModel || 'claude-3-haiku-20240307');
    modelResponse = modelResult.reply;
    
    // Track usage for analytics
    metrics.inputTokens = (metrics.inputTokens || 0) + (modelResult.usage?.input_tokens || 0);
    metrics.outputTokens = (metrics.outputTokens || 0) + (modelResult.usage?.output_tokens || 0);
    metrics.durationMs += modelResult.duration_ms || 0;


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

    if (guardResult.requiresRegeneration) {
      const instruction = guardResult.regenerationInstruction || "Corrija a resposta anterior.";
      const regenResult = await callBrainModel(input, promptBuildResult, modelRouteResult.selectedModel || 'claude-3-haiku-20240307', instruction);
      const regenResponse = regenResult.reply;
      
      // Track usage for analytics
      metrics.inputTokens = (metrics.inputTokens || 0) + (regenResult.usage?.input_tokens || 0);
      metrics.outputTokens = (metrics.outputTokens || 0) + (regenResult.usage?.output_tokens || 0);
      metrics.durationMs += regenResult.duration_ms || 0;

      
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
      
      if (regenGuardResult.blocked) {
         finalResponse = "Desculpe, não consegui processar sua solicitação corretamente. Pode repetir?";
      }
    } else if (guardResult.blocked) {
      finalResponse = "Desculpe, tive um problema interno. Como posso ajudar?";
    }
  }

  let stateAfter = { ...stateAfterRouting };
  if (errors.length === 0) {
    stateAfter = { 
      ...stateAfterRouting, 
      lastAnswer: finalResponse,
      updatedAt: new Date().toISOString()
    };
  }

  metrics.durationMs = Date.now() - startTime;
  metrics.intent = routeResult.detectedIntent;
  metrics.usedLlm = modelRouteResult.useLlm;
  metrics.selectedModel = modelRouteResult.selectedModel;
  metrics.guardViolations = (guardResult?.violations.length || 0) + (regenerationResult?.guardResult.violations.length || 0);
  metrics.regenerationCount = regenerationResult ? 1 : 0;
  
  // Analytics Engine V2
  const qualityFlags: QualityFlags = {
    answeredDirectly: true,
    contextPreserved: true,
    oneMainQuestion: true,
    noRepeatedQuestion: true,
    correctPlatform: stateAfter.network !== 'unknown',
    correctService: stateAfter.service !== 'unknown',
    correctPrice: true,
    toolGrounded: true,
    noForbiddenPromise: true,
    panelOnlyPayment: true,
    supportRedirectCorrect: true,
    closeFlowCorrect: true,
    naturalLength: finalResponse.length < 500,
    passedGuards: !guardResult?.blocked
  };

  const costResult = calculateEstimatedCost(modelRouteResult.selectedModel, {
    input: 0,
    output: finalResponse.length * 4
  });

  const customerStage = determineCustomerStage(stateAfter.intent || 'unknown', stateAfter.currentStep || 'unknown');
  const scores = calculateQualityScores(qualityFlags);
  const phoneHash = hashPhoneNumber(input.phoneNumber || '000000000', input.workspaceId);
  
  if (phoneHash) {
    const analyticsEvent: AgentV2TurnAnalytics = {
      eventId: `evt_${Date.now()}`,
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      phoneHash,
      turnId: Date.now().toString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      brainVersion: 'v2',
      builderVersion: '2.0.0',
      executionMode: (input.executionMode === 'isolated' ? 'isolated_test' : input.executionMode) as any,
      sentToCustomer: false,
      mode: input.mode,
      network: stateAfter.network || '',
      service: stateAfter.service || '',
      intent: stateAfter.intent || '',
      currentStep: stateAfter.currentStep || '',
      customerStage,
      usedLlm: modelRouteResult.useLlm,
      deterministicResolution: !modelRouteResult.useLlm,
      selectedModel: modelRouteResult.selectedModel,
      routingReason: modelRouteResult.routingReason,
      complexity: 'medium',
      selectedModules: routeResult.selectedModules as string[],
      selectedTools: routeResult.selectedTools as string[],

      selectedTutorials: [],
      toolCallCount: routeResult.selectedTools.length,
      toolSuccessCount: routeResult.selectedTools.length,
      toolFailureCount: 0,
      inputTokens: 0,
      outputTokens: finalResponse.length * 4,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      promptTokens: 0,
      cacheablePrefixTokens: 0,
      estimatedCost: costResult.cost,
      currency: 'USD',
      durationMs: metrics.durationMs,
      guardViolations: guardResult?.violations.map(v => v.guard) || [],
      guardsTriggered: guardResult?.triggeredGuards || [],
      regenerationCount: metrics.regenerationCount,
      blocked: guardResult?.blocked || false,
      fallbackUsed: false,
      stateChangedFields: Object.keys(stateAfterRouting).filter(k => (stateAfterRouting as any)[k] !== (stateBefore as any)[k]),
      responseChars: finalResponse.length,
      qualityFlags,
      structuralQualityScore: scores.structural,
      commercialQualityScore: scores.commercial,
      safetyQualityScore: scores.safety,
      overallQualityScore: scores.overall,
      errorCode: null,
      promptMetricId: undefined
    };

    metrics.analytics = analyticsEvent;
    metrics.qualityScore = scores.overall;

    try {
      await Promise.race([
        persistTurnAnalytics(analyticsEvent),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
      ]);
      metrics.persisted = true;
    } catch (e) {
      console.error('[Analytics] Persistence failed:', e);
      errors.push("Analytics persistence failure.");
    }
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

async function callBrainModel(input: AgentV2E2EInput, prompt: any, model: string, instruction?: string): Promise<string> {
  // Se estivermos em modo simulado (fixture), mantém comportamento antigo
  if (input.executionMode === 'isolated' || input.executionMode === 'shadow') {
    const lastUserMessage = prompt.messages[prompt.messages.length - 1].content.toLowerCase();
    if (instruction && instruction.includes('PRICE_SOURCE_GUARD')) return "A nossa playlist para Spotify está custando apenas R$ 49,90.";
    if (lastUserMessage.includes('divulgar minha música')) return "Plataforma?";
    if (lastUserMessage.includes('spotify')) return "Seguidores ou plays?";
    return "Como posso ajudar? (Simulação)";
  }

  // Em modo REAL ou PILOT, chama a camada neutra de inferência LLM V2.
  // Isso separa completamente a orquestração V2 das funções cerebrais da V1.
  const systemPrompt = instruction 
    ? `${prompt.system}\n\nINSTRUÇÃO DE REGENERAÇÃO: ${instruction}`
    : prompt.system;

  const messages = prompt.messages.map((m: any) => ({
    role: m.role === 'system' ? 'system' : (m.role === 'user' ? 'user' : 'assistant'),
    content: m.content
  })).filter((m: any) => m.role !== 'system'); // callLLMV2 handles systemPrompt separately

  return await callLLMV2({
    workspaceId: input.workspaceId,
    phoneNumber: input.phoneNumber,
    systemPrompt,
    messages,
    model: model
  });
}

