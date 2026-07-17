/**
 * Agent Mind V2 - Module Router
 */
/**
 * Pure function to route modules based on input
 */
export function routeModulesV2(input) {
    const startTime = Date.now();
    const { currentMessage, conversationState } = input;
    const msg = currentMessage.toLowerCase();
    const selectedModules = new Set(['mission', 'identity', 'guards']);
    const selectedTools = new Set();
    const selectedTutorials = new Set();
    const stateEvents = [];
    const warnings = [];
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
        applyIntentRouting(intent, msg, conversationState, detectedNetwork, selectedModules, selectedTools, selectedTutorials, warnings, stateEvents);
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
function detectIntents(msg) {
    const detected = [];
    // Rules based on keywords
    if (/^(oi|olá|bom dia|boa tarde|boa noite|opa|eae)/i.test(msg))
        detected.push('greeting');
    if (/(spotify|instagram|youtube|tiktok|facebook|kwai|música|artista|playlist|seguidores|plays|ouvintes|reproduções|saves|streams|streams?)/i.test(msg)) {
        detected.push('network_detection');
    }
    if (/(preço|valor|quanto|custa|tabela|promoção|custar)/i.test(msg))
        detected.push('price');
    if (/(como|melhor|diferença|qual)/i.test(msg))
        detected.push('comparison');
    if (/(comprar|assinar|contratar|pedir|fechar|quanto \d+|onde pago|manda o painel|como compro)/i.test(msg))
        detected.push('buy');
    if (/(pagamento|pix|cartão|pagar|saldo|recarga)/i.test(msg))
        detected.push('payment');
    if (/(testar|teste|grátis|gratuito)/i.test(msg))
        detected.push('free_test');
    if (/(caiu|erro|problema|ajuda|suporte|não funciona|pedido)/i.test(msg))
        detected.push('support');
    if (/(cadastro|conta|entrar|login|registrar|como)/i.test(msg))
        detected.push('tutorial');
    if (/(obrigado|vlw|valeu|show|tchau|até)/i.test(msg))
        detected.push('goodbye');
    // Handle multi-intent
    if (detected.length === 0)
        return 'general_question';
    return detected.length === 1 ? detected[0] : detected;
}
function detectNetwork(msg, currentNetwork) {
    if (msg.includes('spotify'))
        return 'spotify';
    if (msg.includes('instagram'))
        return 'instagram';
    if (msg.includes('youtube'))
        return 'youtube';
    if (msg.includes('tiktok'))
        return 'tiktok';
    if (msg.includes('facebook'))
        return 'facebook';
    if (msg.includes('kwai'))
        return 'kwai';
    // If no explicit network but message mentions music/playlist/saves, it might be Spotify (but we don't force it if unknown)
    return currentNetwork || 'unknown';
}
function applyIntentRouting(intent, msg, state, detectedNetwork, selectedModules, selectedTools, selectedTutorials, warnings, stateEvents) {
    // Commercial modules loading logic
    const commercialIntents = ['price', 'comparison', 'buy', 'free_test', 'discover_service'];
    if (commercialIntents.includes(intent) || msg.length > 20) {
        selectedModules.add('commercial');
    }
    // Network module loading
    if (detectedNetwork === 'spotify') {
        selectedModules.add('spotify_overview');
        // Submodule selection for Spotify
        if (msg.includes('playlist') || msg.includes('música') || state.service === 'playlist') {
            selectedModules.add('spotify_playlist');
            if (detectedNetwork === 'spotify' && state.service !== 'playlist') {
                stateEvents.push({ type: 'service_detected', value: 'playlist' });
            }
        }
        else if (msg.includes('seguidores') || msg.includes('perfil') || msg.includes('artista') || state.service === 'followers') {
            selectedModules.add('spotify_followers');
            if (detectedNetwork === 'spotify' && state.service !== 'followers') {
                stateEvents.push({ type: 'service_detected', value: 'followers' });
            }
        }
    }
    else if (detectedNetwork !== 'unknown') {
        // Check if it's a valid V2Module
        const validModules = [
            'instagram', 'youtube', 'tiktok', 'facebook', 'kwai', 'spotify_overview',
            'spotify_playlist', 'spotify_followers', 'mission', 'identity', 'guards',
            'receptive', 'outbound', 'commercial', 'panel', 'payments', 'tutorials',
            'free_test', 'support'
        ];
        if (validModules.includes(detectedNetwork)) {
            selectedModules.add(detectedNetwork);
        }
    }
    switch (intent) {
        case 'network_detection':
            if (detectedNetwork !== 'unknown') {
                selectedTools.add('consultar_servicos');
            }
            break;
        case 'greeting':
            // Basic core + mode
            break;
        case 'price':
            if (detectedNetwork === 'unknown') {
                warnings.push('preço sem rede definida');
            }
            else {
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
            if (msg.includes('pedido') || msg.includes('caiu')) {
                selectedModules.delete('spotify_overview');
                selectedModules.delete('spotify_playlist');
                selectedModules.delete('spotify_followers');
                selectedModules.delete('commercial');
            }
            break;
        case 'tutorial':
            selectedModules.add('panel');
            selectedModules.add('tutorials');
            if (msg.includes('cadastro') || msg.includes('conta'))
                selectedTutorials.add('registration');
            if (msg.includes('saldo') || msg.includes('recarga') || msg.includes('coloco'))
                selectedTutorials.add('recharge');
            if (msg.includes('pedido') || msg.includes('comprar'))
                selectedTutorials.add('order');
            break;
        case 'free_test':
            selectedModules.add('free_test');
            if (state.freeTest.status === 'accepted' && state.freeTest.link) {
                selectedTools.add('teste_gratis');
            }
            else {
                warnings.push('parâmetros faltantes para teste_gratis');
            }
            break;
        case 'comparison':
            if (msg.includes('instagram') && msg.includes('tiktok')) {
                selectedModules.add('instagram');
                selectedModules.add('tiktok');
            }
            break;
    }
}
function generateRoutingReason(intents, network) {
    const intentStr = Array.isArray(intents) ? intents.join('+') : intents;
    return `Intent: ${intentStr}, Network: ${network}`;
}
