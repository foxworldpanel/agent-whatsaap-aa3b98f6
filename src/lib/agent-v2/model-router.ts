/**
 * Agent Mind V2 - Model Router
 */

import { 
  MODEL_CONFIG_V2, 
  V2Complexity, 
  V2RoutingReason 
} from './model-router.types';
import { ConversationStateV2 } from './conversation-state.types';
import { RouteModulesV2Output } from './router.types';

export interface RouteModelV2Input {
  currentMessage: string;
  conversationState: ConversationStateV2;
  routeResult: RouteModulesV2Output;
  mediaType?: 'text' | 'image' | 'audio';
  hasImage?: boolean;
  hasAudio?: boolean;
  messageLength?: number;
  detectedComplexity?: V2Complexity;
  selectedTools?: string[];
}

export interface RouteModelV2Output {
  useLlm: boolean;
  selectedModel: string | null;
  requiresVision: boolean;
  requiresTranscription: boolean;
  routingReason: V2RoutingReason;
  confidence: number;
  warnings: string[];
  metrics: {
    decisionDurationMs: number;
    complexity: V2Complexity;
    estimatedCostClass: 'zero' | 'low' | 'high';
  };
}

/**
 * Decide o roteamento de modelos e uso de LLM
 */
export function routeModelV2(input: RouteModelV2Input): RouteModelV2Output {
  const startTime = Date.now();
  const msg = input.currentMessage.toLowerCase();
  const { conversationState, routeResult } = input;
  
  let useLlm = true;
  let selectedModel: string | null = MODEL_CONFIG_V2.lightweightModel;
  let requiresVision = false;
  let requiresTranscription = !!input.hasAudio;
  let routingReason: V2RoutingReason = 'simple_commercial';
  let complexity: V2Complexity = 'simple';
  let confidence = 1.0;
  const warnings: string[] = [];

  // 1. Decisões Determinísticas (Sem LLM)
  const isDeterministic = checkDeterministicCase(input);
  if (isDeterministic) {
    return {
      useLlm: false,
      selectedModel: null,
      requiresVision: false,
      requiresTranscription: !!input.hasAudio,
      routingReason: 'deterministic_state',
      confidence: 1.0,
      warnings: [],
      metrics: {
        decisionDurationMs: Date.now() - startTime,
        complexity: 'deterministic',
        estimatedCostClass: 'zero'
      }
    };
  }

  // 2. Classificação de Complexidade
  complexity = classifyComplexity(input);

  // 3. Atribuição de Modelo e Motivo
  if (input.hasImage) {
    requiresVision = true;
    selectedModel = MODEL_CONFIG_V2.visionModel;
    routingReason = 'vision_required';
  } else if (complexity === 'complex' || complexity === 'moderate') {
    // Só promove para modelo forte se houver complexidade real (multi-intenção ou comparação complexa)
    if (routeResult.warnings.length > 0 || Array.isArray(routeResult.detectedIntent) && routeResult.detectedIntent.length > 1) {
      selectedModel = MODEL_CONFIG_V2.strongModel;
      routingReason = 'multi_intent';
    } else if (msg.includes('qual é melhor') || msg.includes('diferença')) {
      selectedModel = MODEL_CONFIG_V2.strongModel;
      routingReason = 'objection_complex';
    }
  } else {
    // Casos de Modelo Leve
    const mainIntent = Array.isArray(routeResult.detectedIntent) ? routeResult.detectedIntent[0] : routeResult.detectedIntent;
    
    if (mainIntent === 'greeting') routingReason = 'greeting';
    else if (mainIntent === 'price' || routeResult.selectedTools.includes('consultar_servicos')) routingReason = 'price_lookup';
    else if (mainIntent === 'support') routingReason = 'support_redirect';
    else if (mainIntent === 'tutorial') routingReason = 'panel_guidance';
    else if (mainIntent === 'payment') routingReason = 'payment_guidance';
    else if (mainIntent === 'free_test') routingReason = 'free_test_flow';
    
    if (input.hasAudio) routingReason = 'audio_simple';
  }

  return {
    useLlm,
    selectedModel,
    requiresVision,
    requiresTranscription,
    routingReason,
    confidence,
    warnings,
    metrics: {
      decisionDurationMs: Date.now() - startTime,
      complexity,
      estimatedCostClass: selectedModel === MODEL_CONFIG_V2.strongModel ? 'high' : 'low'
    }
  };
}

function checkDeterministicCase(input: RouteModelV2Input): boolean {
  const msg = input.currentMessage.toLowerCase().trim();
  const lastQ = input.conversationState.lastQuestion?.toLowerCase() || '';
  const { routeResult } = input;

  // Sim/Não para cadastro ou saldo
  if (['sim', 'não', 'nao'].includes(msg) && (lastQ.includes('cadastro') || lastQ.includes('conta') || lastQ.includes('saldo'))) {
    return true;
  }

  // Quantidade numérica pura
  if (/^\d+$/.test(msg) && (lastQ.includes('quantidade') || lastQ.includes('quanto'))) {
    return true;
  }

  // Callback de teste concluído
  if (msg.includes('__test_callback__') || msg.includes('teste concluído')) {
    return true;
  }

  // Suporte direto (opcionalmente sem LLM se for um redirecionamento simples)
  if (routeResult.detectedIntent === 'support' && (msg.includes('pedido caiu') || msg.includes('meu pedido'))) {
    // Podemos permitir useLlm=false se quisermos uma resposta local fixa
    // mas a regra diz "useLlm=false ou modelo leve", vamos priorizar a consistência
    // Para ser determinístico (useLlm=false), retornamos true aqui.
    return true;
  }

  return false;
}


function classifyComplexity(input: RouteModelV2Input): V2Complexity {
  const msg = input.currentMessage;
  const { routeResult } = input;

  if (input.hasImage) return 'vision_required';
  
  const isMultiIntent = Array.isArray(routeResult.detectedIntent) && routeResult.detectedIntent.length > 1;
  const isLong = msg.length > 250;
  const isComparative = msg.includes('melhor') || msg.includes('comparar') || msg.includes('diferença');

  if (isMultiIntent || (isLong && isComparative)) return 'complex';
  if (isComparative || isLong) return 'moderate';
  
  return 'simple';
}
