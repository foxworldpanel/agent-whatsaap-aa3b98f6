/**
 * Agent Mind V2 - Spotify & Services Tests
 */

import { routeModulesV2 } from './router';
import { buildPromptV2 } from './prompt-builder';
import { consultarServicosV2 } from './services';
import { ConversationStateV2 } from './conversation-state.types';

const mockState: ConversationStateV2 = {
  conversationId: 'test',
  workspaceId: 'test',
  phoneNumber: '5511999999999',
  mode: 'receptive',
  network: 'unknown',
  service: 'unknown',
  intent: 'greeting',
  currentStep: 'greeting',
  customer: { hasAccount: false, hasBalance: false },
  payment: {},
  freeTest: { status: 'none' },
  tutorial: { active: false },
  support: { active: false },
  toolsUsed: [],
  loadedModules: [],
  facts: {},
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export async function runSpotifyTests() {
  console.log('🚀 Iniciando Testes Spotify V2 & Services\n');

  const runFlow = async (msg: string, state: ConversationStateV2, toolResults: any = {}) => {
    const routeResult = routeModulesV2({ currentMessage: msg, conversationState: state });
    
    // Update state based on events for the next part of the test if needed
    let newState = { ...state };
    for (const event of routeResult.stateEvents) {
      if (event.type === 'network_detected') newState.network = event.value as any;
      if (event.type === 'service_detected') newState.service = event.value as any;
    }

    const prompt = buildPromptV2({
      currentMessage: msg,
      conversationState: newState,
      routeResult,
      toolResults,
      history: [],
      brainVersion: 'v2',
      builderVersion: '2.0.0'
    });

    return { routeResult, prompt, newState };
  };

  // A) "Quero divulgar minha música."
  const testA = await runFlow('Quero divulgar minha música.', mockState);
  console.log('Cenário A: "Quero divulgar minha música."');
  console.log('   Modules:', testA.routeResult.selectedModules);
  const isOkA = !testA.routeResult.selectedModules.includes('spotify_overview');
  console.log(isOkA ? '   ✅ Não presumiu Spotify.' : '   ❌ Erro: Presumiu Spotify.');

  // B) "Spotify"
  const testB = await runFlow('Spotify', mockState);
  console.log('Cenário B: "Spotify"');
  const isOkB = testB.newState.network === 'spotify' && testB.routeResult.selectedModules.includes('spotify_overview');
  console.log(isOkB ? '   ✅ Travou rede Spotify e carregou overview.' : '   ❌ Erro no roteamento Spotify.');

  // C) "Quero playlist"
  const testC = await runFlow('Quero playlist', testB.newState);
  console.log('Cenário C: "Quero playlist"');
  const isOkC = testC.newState.service === 'playlist' && testC.routeResult.selectedModules.includes('spotify_playlist') && !testC.routeResult.selectedModules.includes('spotify_followers');
  console.log(isOkC ? '   ✅ Carregou spotify_playlist e não seguidores.' : '   ❌ Erro no submódulo playlist.');

  // D) "Quanto custa?"
  console.log('Cenário D: "Quanto custa?" (Preço)');
  const fixtureD = await consultarServicosV2({
    workspaceId: 'test',
    network: 'spotify',
    service: 'playlist',
    queryLevel: 'detail'
  });
  const testD = await runFlow('Quanto custa?', testC.newState, { consultar_servicos: fixtureD });
  const hasPrice = testD.prompt.systemPrompt.includes('49.9');
  console.log(hasPrice ? '   ✅ Retornou preço R$ 49,90 da fixture.' : '   ❌ Preço não encontrado no prompt.');

  // F) "Quero plays" (Serviço Inativo)
  console.log('Cenário F: "Quero plays" (Inativo)');
  const fixtureF = await consultarServicosV2({
    workspaceId: 'test',
    network: 'spotify',
    service: 'plays',
    queryLevel: 'detail'
  });
  const testF = await runFlow('Quero plays', testB.newState, { consultar_servicos: fixtureF });
  const hasInativo = testF.prompt.systemPrompt.includes('indisponível') && testF.prompt.systemPrompt.includes('alternatives');
  console.log(hasInativo ? '   ✅ Identificou serviço inativo e trouxe alternativas.' : '   ❌ Falha ao lidar com serviço inativo.');

  // I) "Vamos fechar"
  console.log('Cenário I: "Vamos fechar"');
  const testI = await runFlow('Vamos fechar', testC.newState);
  const hasPanel = testI.routeResult.selectedModules.includes('panel');
  console.log(hasPanel ? '   ✅ Carregou painel para fechamento.' : '   ❌ Painel não carregado.');

  // K) "Meu pedido de Spotify caiu." (Suporte)
  console.log('Cenário K: "Meu pedido de Spotify caiu."');
  const testK = await runFlow('Meu pedido de Spotify caiu.', testB.newState);
  const hasSupport = testK.routeResult.selectedModules.includes('support') && !testK.routeResult.selectedModules.includes('spotify_playlist');
  console.log(hasSupport ? '   ✅ Carregou suporte e removeu comercial.' : '   ❌ Erro no roteamento de suporte.');

  console.log('\n📊 Testes Spotify finalizados.\n');
}
