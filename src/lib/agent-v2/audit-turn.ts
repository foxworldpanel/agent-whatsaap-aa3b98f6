import { buildPromptV2 } from './prompt-builder';
import { routeModulesV2 } from './router';

async function auditPromptOnly() {
  const workspaceId = 'bd59fa41-d5d2-4f36-96a8-a3411784962d';
  const phone = '5511999999999';

  const state = {
    workspaceId,
    conversationId: 'audit-test-conv',
    phoneNumber: phone,
    mode: 'receptive' as const,
    network: 'spotify' as const,
    service: 'playlist',
    intent: 'price' as const,
    currentStep: 'presenting_solution' as const,
    customer: { hasAccount: false, hasBalance: false },
    payment: {},
    freeTest: { status: 'none' as const },
    tutorial: { active: false },
    support: { active: false },
    toolsUsed: [],
    loadedModules: [],
    facts: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const routeResult = routeModulesV2({
    currentMessage: 'Vocês têm 1.000 plays e ouvintes globais no Spotify? Qual o valor?',
    conversationState: state
  });

  const prompt = buildPromptV2({
    conversationState: state,
    routeResult,
    history: [
      { sender: 'cliente', body: 'Vocês têm 1.000 plays e ouvintes globais no Spotify? Qual o valor?' }
    ],
    toolResults: {
      catalog: [
        {
          service: 2269,
          name: 'Spotify - Plays + Ouvintes [GLOBAL]',
          rate: 15.00,
          min: 1000,
          status: 'active'
        }
      ]
    },
    currentMessage: 'Vocês têm 1.000 plays e ouvintes globais no Spotify? Qual o valor?',
    brainVersion: 'v2',
    builderVersion: '2.0.0'
  });

  console.log('--- AUDITORIA DE PROMPT (STATIC ANALYSIS) ---');
  console.log('MODULES:', routeResult.selectedModules);
  
  const hasDisabledRule = prompt.systemPrompt.includes('atualização') || prompt.systemPrompt.includes('plays e ouvintes estão desativados');
  console.log('DISABLED RULE DETECTED IN PROMPT:', hasDisabledRule ? 'SIM' : 'NÃO');
  
  if (hasDisabledRule) {
    console.log('--- PROMPT SYSTEM (FRAGMENTO ONDE ESTÁ A REGRA) ---');
    const index = prompt.systemPrompt.indexOf('atualização');
    console.log(prompt.systemPrompt.slice(Math.max(0, index - 100), index + 100));
  } else {
    console.log('PROMPT LIMPO DE REGRAS ESTÁTICAS DE INDISPONIBILIDADE.');
  }
}

auditPromptOnly();


