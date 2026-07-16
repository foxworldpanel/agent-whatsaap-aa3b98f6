/**
 * Agent Mind V2 - Prompt Builder Tests
 */

import { buildPromptV2 } from './prompt-builder';
import { routeModulesV2 } from './router';
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

export async function runBuilderTests() {
  console.log('🚀 Iniciando Testes do Prompt Builder V2\n');

  // Helper para rodar Router + Builder
  const runFlow = (msg: string, state: ConversationStateV2, extras: any = {}) => {
    const routeResult = routeModulesV2({ currentMessage: msg, conversationState: state });
    return buildPromptV2({
      currentMessage: msg,
      conversationState: state,
      routeResult,
      history: extras.history || [],
      toolResults: extras.toolResults || {},
      brainVersion: 'v2',
      builderVersion: '2.0.0'
    });
  };

  const tests = [
    {
      name: 'A) "Boa tarde"',
      fn: () => {
        const res = runFlow('Boa tarde', { ...mockState });
        const hasCommercial = res.systemPrompt.includes('Regras Comerciais');
        const hasCacheable = res.cacheablePrefix.includes('Sua missão é atuar como Júlia');
        return !hasCommercial && hasCacheable;
      }
    },
    {
      name: 'B) "Spotify"',
      fn: () => {
        const res = runFlow('Quero Spotify', { ...mockState });
        return res.systemPrompt.includes('Módulo Spotify') && !res.systemPrompt.includes('consultar_servicos');
      }
    },
    {
      name: 'C) Preço com Tool Fixture',
      fn: () => {
        const state = { ...mockState, network: 'spotify' as any };
        const fixture = {
          service_name: 'Aluguel de Playlist',
          sale_price: 49.90,
          link_type: 'track',
          is_active: true
        };
        const res = runFlow('Quanto custa?', state, { toolResults: { consultar_servicos: fixture } });
        const hasFixture = res.systemPrompt.includes('Aluguel de Playlist') && res.systemPrompt.includes('49.9');
        const count49 = (res.systemPrompt.match(/49\.9/g) || []).length;
        return hasFixture && count49 === 1;
      }
    },
    {
      name: 'D) "Meu pedido caiu" (Support)',
      fn: () => {
        const res = runFlow('Meu pedido caiu', { ...mockState });
        return res.systemPrompt.includes('Módulo Suporte Técnico') && !res.systemPrompt.includes('Regras Comerciais');
      }
    },
    {
      name: 'E) "Não tenho cadastro" (Tutorial)',
      fn: () => {
        const res = runFlow('Não tenho cadastro', { ...mockState });
        return res.systemPrompt.includes('Módulo Painel Oficial') && res.systemPrompt.includes('Tutorial de Cadastro');
      }
    },
    {
      name: 'G) Mudança de Rede (YouTube)',
      fn: () => {
        const state = { ...mockState, network: 'spotify' as any };
        const res = runFlow('Na verdade quero YouTube', state);
        return res.systemPrompt.includes('Módulo YouTube') && !res.systemPrompt.includes('Módulo Spotify');
      }
    },
    {
      name: 'H) Comparação Instagram x TikTok',
      fn: () => {
        const res = runFlow('Instagram ou TikTok, qual é melhor?', { ...mockState });
        return res.systemPrompt.includes('Módulo Instagram') && res.systemPrompt.includes('Módulo TikTok');
      }
    },
    {
      name: 'J) Tool Fixture vence Histórico',
      fn: () => {
        const state = { ...mockState, network: 'spotify' as any };
        const history = [{ sender: 'agente' as const, body: 'A playlist custa R$ 97' }];
        const fixture = { sale_price: 49.90 };
        const res = runFlow('Qual o preço atual?', state, { history, toolResults: { consultar_servicos: fixture } });
        // No Builder V2, o Tool Results entra no system prompt. O modelo deve priorizar o que está no system prompt.
        return res.systemPrompt.includes('49.9') && res.messages.some(m => m.content.includes('R$ 97'));
      }
    },
    {
      name: 'Teste de Duplicação',
      fn: () => {
        const res = runFlow('Oi', { ...mockState });
        const countMission = (res.systemPrompt.match(/Sua missão é atuar como Júlia/g) || []).length;
        return countMission === 1;
      }
    },
    {
      name: 'Teste de Cacheable Prefix',
      fn: () => {
        const res1 = runFlow('Oi', { ...mockState });
        const res2 = runFlow('Quero Spotify', { ...mockState });
        const res3 = runFlow('Pedido caiu', { ...mockState });
        return res1.cacheablePrefix === res2.cacheablePrefix && res2.cacheablePrefix === res3.cacheablePrefix;
      }
    }
  ];

  let passed = 0;
  for (const t of tests) {
    try {
      if (t.fn()) {
        console.log(`✅ PASSED: ${t.name}`);
        passed++;
      } else {
        console.error(`❌ FAILED: ${t.name}`);
      }
    } catch (e) {
      console.error(`❌ ERROR in ${t.name}:`, e);
    }
  }

  console.log(`\n📊 Resultado Builder: ${passed}/${tests.length} testes passaram.\n`);
}
