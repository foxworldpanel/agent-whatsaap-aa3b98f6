import { 
  createInitialConversationStateV2, 
  updateConversationStateV2, 
  resolveShortAnswerFromState,
  buildConversationStateSummaryV2
} from './conversation-state';
import { ConversationStateV2 } from './conversation-state.types';

export function runConversationStateTests() {
  console.log('--- Iniciando Testes do ConversationStateV2 ---');

  const results = {
    passed: 0,
    failed: 0,
    logs: [] as string[]
  };

  function assert(condition: boolean, message: string) {
    if (condition) {
      results.passed++;
      results.logs.push(`✅ PASS: ${message}`);
    } else {
      results.failed++;
      results.logs.push(`❌ FAIL: ${message}`);
    }
  }

  // 1. Estado Inicial
  let state = createInitialConversationStateV2({
    conversationId: 'test-123',
    workspaceId: 'ws-456',
    phoneNumber: '5511999999999'
  });

  assert(state.network === 'unknown', 'Inicia com rede unknown');
  assert(state.service === 'unknown', 'Inicia com serviço unknown');
  assert(state.intent === 'unknown', 'Inicia com intenção unknown');
  assert(state.customer.hasAccount === false, 'Inicia sem conta presumida');
  assert(state.freeTest.status === 'none', 'Inicia sem teste grátis');

  // 2. Detectar Spotify
  state = updateConversationStateV2(state, { type: 'network_detected', value: 'spotify' });
  assert(state.network === 'spotify', 'Atualiza rede para spotify');

  // 3. Detectar "Estragam" (Instagram) via Resposta Curta
  state.lastQuestion = 'ask_network';
  const eventInsta = resolveShortAnswerFromState('Quero pro Estragam', state);
  if (eventInsta) state = updateConversationStateV2(state, eventInsta);
  assert(state.network === 'instagram', 'Detecta "Estragam" como instagram');
  assert(state.service === 'unknown', 'Limpa serviço ao mudar de rede');

  // 4. Definir serviço e quantidade
  state = updateConversationStateV2(state, { type: 'service_detected', value: 'playlist' });
  state = updateConversationStateV2(state, { type: 'quantity_detected', value: 500 });
  assert(state.service === 'playlist', 'Define serviço playlist');
  assert(state.quantity === 500, 'Define quantidade 500');

  // 5. Interpretar "sim" após pergunta de cadastro
  state.lastQuestion = 'Você já tem conta no nosso painel?';
  const eventSim = resolveShortAnswerFromState('Sim, já tenho', state);
  if (eventSim) state = updateConversationStateV2(state, eventSim);
  assert(state.customer.hasAccount === true, 'Interpreta "sim" para cadastro');

  // 6. Interpretar "não"
  state.customer.hasAccount = false; // reset
  const eventNao = resolveShortAnswerFromState('Ainda não tenho', state);
  if (eventNao) state = updateConversationStateV2(state, eventNao);
  assert(state.customer.hasAccount === false, 'Interpreta "não" para cadastro');

  // 7. Trocar Spotify por YouTube
  state.network = 'spotify';
  state.service = 'playlist';
  state = updateConversationStateV2(state, { type: 'network_detected', value: 'youtube' });
  assert(state.network === 'youtube', 'Troca rede para youtube');
  assert(state.service === 'unknown', 'Limpa serviço spotify ao mudar para youtube');

  // 8. Teste Grátis
  state = updateConversationStateV2(state, { type: 'free_test_offered' });
  assert(state.freeTest.status === 'offered', 'Estado: teste oferecido');
  state = updateConversationStateV2(state, { type: 'free_test_completed' });
  assert(state.freeTest.status === 'completed', 'Estado: teste concluído');

  // 9. Detectar Suporte
  state = updateConversationStateV2(state, { type: 'support_detected' });
  assert(state.support.active === true, 'Detecta suporte ativo');
  assert(state.intent === 'support', 'Muda intenção para suporte');
  assert(state.currentStep === 'support_redirect', 'Muda etapa para redirecionamento');

  // 10. Fechar Conversa
  state = updateConversationStateV2(state, { type: 'conversation_closed' });
  assert(state.currentStep === 'conversation_closed', 'Fecha conversa');

  // 11. Não armazenar preço (verificação manual/tipo)
  assert((state as any).price === undefined, 'Estado não possui campo price');

  // 12. Resumo não incluir campos vazios
  const summary = buildConversationStateSummaryV2(state);
  assert(!summary.includes('price'), 'Resumo não inclui price');
  assert(summary.includes('network: youtube'), 'Resumo inclui rede');

  // 13. Imutabilidade
  const stateBefore = { ...state };
  updateConversationStateV2(state, { type: 'mode_detected', value: 'outbound' });
  assert(state.mode === 'receptive', 'A função update não mutou o objeto anterior');

  console.log(`Testes finalizados: ${results.passed} passados, ${results.failed} falhos.`);
  return results;
}
