/**
 * Agent Mind V2 - Model Router
 */
import { MODEL_CONFIG_V2 } from './model-router.types';
/**
 * Decide o roteamento de modelos e uso de LLM
 */
export function routeModelV2(input) {
    const startTime = Date.now();
    const msg = input.currentMessage.toLowerCase();
    const { conversationState, routeResult } = input;
    let useLlm = true;
    let selectedModel = MODEL_CONFIG_V2.lightweightModel;
    let requiresVision = false;
    let requiresTranscription = !!input.hasAudio;
    let routingReason = 'simple_commercial';
    let complexity = 'simple';
    let confidence = 1.0;
    const warnings = [];
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
    }
    else if (complexity === 'complex') {
        // DESATIVADO: Promoção automática para Sonnet durante homologação.
        // Usar apenas Haiku conforme diretriz de controle de custos.
        selectedModel = MODEL_CONFIG_V2.lightweightModel;
        routingReason = 'multi_intent';
        warnings.push('Sonnet promotion disabled for cost control');
    }
    else if (complexity === 'moderate') {
        selectedModel = MODEL_CONFIG_V2.lightweightModel;
        routingReason = 'simple_commercial';
    }
    else {
        // Casos de Modelo Leve
        const mainIntent = Array.isArray(routeResult.detectedIntent) ? routeResult.detectedIntent[0] : routeResult.detectedIntent;
        if (mainIntent === 'greeting')
            routingReason = 'greeting';
        else if (mainIntent === 'price' || routeResult.selectedTools.includes('consultar_servicos'))
            routingReason = 'price_lookup';
        else if (mainIntent === 'support')
            routingReason = 'support_redirect';
        else if (mainIntent === 'tutorial')
            routingReason = 'panel_guidance';
        else if (mainIntent === 'payment')
            routingReason = 'payment_guidance';
        else if (mainIntent === 'free_test')
            routingReason = 'free_test_flow';
        if (input.hasAudio)
            routingReason = 'audio_simple';
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
            estimatedCostClass: 'low' // Sonnet promotion disabled
        }
    };
}
function checkDeterministicCase(input) {
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
function classifyComplexity(input) {
    const msg = input.currentMessage;
    const { routeResult } = input;
    if (input.hasImage)
        return 'vision_required';
    const isMultiIntent = Array.isArray(routeResult.detectedIntent) && routeResult.detectedIntent.length > 1;
    const isLong = msg.length > 250;
    const isComparative = msg.includes('melhor') || msg.includes('comparar') || msg.includes('diferença');
    if (isMultiIntent || (isLong && isComparative))
        return 'complex';
    if (isComparative || isLong)
        return 'moderate';
    return 'simple';
}
