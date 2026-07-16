/**
 * Agent Mind V2 - Module Router
 */

import { 
  RouteModulesV2Input, 
  RouteModulesV2Output, 
  V2Module, 
  V2Tool, 
  V2Tutorial 
} from './router.types';
import { V2Intent, V2Network, V2StateEvent, ConversationStateV2 } from './conversation-state.types';

/**
 * Pure function to route modules based on input
 */
export function routeModulesV2(input: RouteModulesV2Input): RouteModulesV2Output {
  const startTime = Date.now();
  const { currentMessage, conversationState } = input;
  const msg = currentMessage.toLowerCase();
  
  const selectedModules: Set<V2Module> = new Set(['mission', 'identity', 'guards']);
  const selectedTools: Set<V2Tool> = new Set();
  const selectedTutorials: Set<V2Tutorial> = new Set();
  const stateEvents: V2StateEvent[] = [];
  const warnings: string[] = [];

  // 1. Detect Intent(s)
  const intents = detectIntents(msg);
  const mainIntent = Array.isArray(intents) ? intents[0] : intents;

  // 2. Detect Mode (always load one)
  const mode = conversationState.mode || 'receptive';
  selectedModules.add(mode);

  // 3. Detect Network
  const detectedNetwork = detectNetwork(msg, conversationState.network);
  if (detectedNetwork !== 'unknown' && detectedNetwork !== conversationState.network) {
    stateEvents.push({ type: 'network_detected', value: detectedNetwork });
  }

  // 4. Routing Logic based on Intent
  const allIntents = Array.isArray(intents) ? intents : [intents];
  
  for (const intent of allIntents) {
    applyIntentRouting(
      intent, 
      msg, 
      conversationState, 
      detectedNetwork,
      selectedModules, 
      selectedTools, 
      selectedTutorials, 
      warnings, 
      stateEvents
    );
  }

  // Final validation and metrics
  const duration = Date.now() - startTime;

  return {
    selectedModules: Array.from(selectedModules),
    selectedTools: Array.from(selectedTools),
    selectedTutorials: Array.from(selectedTutorials),
    detectedMode: mode,
    detectedNetwork: detectedNetwork,
    detectedService: conversationState.service, // Placeholder for now
    detectedIntent: intents,
    routingReason: generateRoutingReason(allIntents, detectedNetwork),
    stateEvents,
    warnings,
    metrics: {
      moduleCount: selectedModules.size,
      toolCount: selectedTools.size,
      tutorialCount: selectedTutorials.size,
      routingDurationMs: duration,
      warningsCount: warnings.length
    }
  };
}

function detectIntents(msg: string): V2Intent | V2Intent[] {
  const detected: V2Intent[] = [];

  // Rules based on keywords
  if (/^(oi|olá|bom dia|boa tarde|boa noite|opa|eae)/i.test(msg)) detected.push('greeting');
  if (/(spotify|instagram|youtube|tiktok|facebook|kwai)/i.test(msg)) detected.push('network_detection' as any); // Transitionary intent or logic
  if (/(preço|valor|quanto|custa|tabela|promoção)/i.test(msg)) detected.push('price');
  if (/(como|melhor|diferença|qual)/i.test(msg)) detected.push('comparison');
  if (/(comprar|assinar|quero|contratar|pedir)/i.test(msg)) detected.push('buy');
  if (/(pagamento|pix|cartão|pagar|saldo|recarga)/i.test(msg)) detected.push('payment');
  if (/(testar|teste|grátis|gratuito)/i.test(msg)) detected.push('free_test');
  if (/(caiu|erro|problema|ajuda|suporte|não funciona|pedido)/i.test(msg)) detected.push('support');
  if (/(cadastro|conta|entrar|login|registrar)/i.test(msg)) detected.push('tutorial');
  if (/(obrigado|vlw|valeu|show|tchau|até)/i.test(msg)) detected.push('goodbye');

  // Handle multi-intent
  if (detected.length === 0) return 'general_question';
  return detected.length === 1 ? detected[0] : detected;
}

function detectNetwork(msg: string, currentNetwork: V2Network): V2Network {
  if (msg.includes('spotify')) return 'spotify';
  if (msg.includes('instagram')) return 'instagram';
  if (msg.includes('youtube')) return 'youtube';
  if (msg.includes('tiktok')) return 'tiktok';
  if (msg.includes('facebook')) return 'facebook';
  if (msg.includes('kwai')) return 'kwai';
  return currentNetwork || 'unknown';
}

function applyIntentRouting(
  intent: V2Intent,
  msg: string,
  state: ConversationStateV2,
  detectedNetwork: V2Network,
  selectedModules: Set<V2Module>,
  selectedTools: Set<V2Tool>,
  selectedTutorials: Set<V2Tutorial>,
  warnings: string[],
  stateEvents: V2StateEvent[]
) {
  // Commercial modules loading logic
  const commercialIntents: V2Intent[] = ['price', 'comparison', 'buy', 'free_test', 'discover_service' as any];
  if (commercialIntents.includes(intent) || msg.length > 20) {
    selectedModules.add('commercial');
  }

  // Network module loading
  if (detectedNetwork !== 'unknown') {
    selectedModules.add(detectedNetwork as V2Module);
  }

  switch (intent) {
    case 'greeting':
      // Basic core + mode
      break;

    case 'price':
      if (detectedNetwork === 'unknown') {
        warnings.push('preço sem rede definida');
      } else {
        selectedTools.add('consultar_servicos');
      }
      break;

    case 'buy':
      selectedModules.add('panel');
      break;

    case 'payment':
      selectedModules.add('panel');
      selectedModules.add('payments');
      break;

    case 'support':
      selectedModules.add('support');
      // Remove commercial/network if it's strictly support, unless multi-intent (handled by loop)
      break;

    case 'tutorial':
      selectedModules.add('panel');
      selectedModules.add('tutorials');
      if (msg.includes('cadastro') || msg.includes('conta')) selectedTutorials.add('registration');
      if (msg.includes('saldo') || msg.includes('recarga') || msg.includes('coloco')) selectedTutorials.add('recharge');
      if (msg.includes('pedido') || msg.includes('comprar')) selectedTutorials.add('order');
      break;

    case 'free_test':
      selectedModules.add('free_test');
      if (state.freeTest.status === 'accepted' && state.freeTest.link) {
        selectedTools.add('teste_gratis');
      } else {
        warnings.push('parâmetros faltantes para teste_gratis');
      }
      break;

    case 'comparison':
      // If comparing, might need multiple network modules
      // For now, handled by detectedNetwork logic + extra check
      if (msg.includes('instagram') && msg.includes('tiktok')) {
        selectedModules.add('instagram');
        selectedModules.add('tiktok');
      }
      break;
  }
}

function generateRoutingReason(intents: V2Intent[], network: V2Network): string {
  const intentStr = Array.isArray(intents) ? intents.join('+') : intents;
  return `Intent: ${intentStr}, Network: ${network}`;
}
