/**
 * Agent Mind V2 - Router Tests
 */

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

export async function runRouterTests() {
  console.log('🚀 Iniciando Testes do Router V2\n');

  const tests = [
    {
      name: 'A) "Boa tarde"',
      input: 'Boa tarde',
      state: { ...mockState },
      expectedModules: ['mission', 'identity', 'guards', 'receptive'],
      forbiddenModules: ['commercial']
    },
    {
      name: 'B) "Spotify"',
      input: 'Quero Spotify',
      state: { ...mockState },
      expectedModules: ['mission', 'identity', 'guards', 'receptive', 'commercial', 'spotify']
    },
    {
      name: 'D) "Meu pedido caiu"',
      input: 'Meu pedido caiu',
      state: { ...mockState },
      expectedModules: ['support'],
      forbiddenModules: ['commercial', 'spotify']
    },
    {
      name: 'E) "Não tenho cadastro"',
      input: 'Não tenho cadastro',
      state: { ...mockState },
      expectedModules: ['panel', 'tutorials'],
      expectedTutorials: ['registration']
    },
    {
      name: 'F) "Como coloco saldo?"',
      input: 'Como coloco saldo?',
      state: { ...mockState },
      expectedModules: ['panel', 'payments', 'tutorials'],
      expectedTutorials: ['recharge']
    },
    {
      name: 'I) Mudança de Rede (Spotify -> YouTube)',
      input: 'Na verdade quero YouTube',
      state: { ...mockState, network: 'spotify' as any },
      expectedModules: ['youtube'],
      forbiddenModules: ['spotify']
    },
    {
      name: 'L) "Quanto custa?" (Sem rede)',
      input: 'Quanto custa?',
      state: { ...mockState },
      expectedModules: ['commercial'],
      expectedWarnings: ['preço sem rede definida']
    }
  ];

  let passed = 0;

  for (const t of tests) {
    const output = routeModulesV2({
      currentMessage: t.input,
      conversationState: t.state
    });

    const modulesOk = t.expectedModules?.every(m => output.selectedModules.includes(m as any));
    const forbiddenOk = t.forbiddenModules ? !t.forbiddenModules.some(m => output.selectedModules.includes(m as any)) : true;
    const tutorialsOk = t.expectedTutorials ? t.expectedTutorials.every(tut => output.selectedTutorials.includes(tut as any)) : true;
    const warningsOk = t.expectedWarnings ? t.expectedWarnings.every(w => output.warnings.includes(w)) : true;

    const isOk = modulesOk && forbiddenOk && tutorialsOk && warningsOk;

    if (isOk) {
      console.log(`✅ PASSED: ${t.name}`);
      passed++;
    } else {
      console.error(`❌ FAILED: ${t.name}`);
      console.log('   Input:', t.input);
      console.log('   Modules:', output.selectedModules);
      console.log('   Tutorials:', output.selectedTutorials);
      console.log('   Warnings:', output.warnings);
    }
  }

  console.log(`\n📊 Resultado: ${passed}/${tests.length} testes passaram.\n`);
}
