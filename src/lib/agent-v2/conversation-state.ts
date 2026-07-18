import { 
  ConversationStateV2, 
  V2StateEvent, 
  V2Network, 
  V2Intent,
  V2Step
} from './conversation-state.types';

/**
 * Cria o estado inicial para uma nova conversa na V2
 */
export function createInitialConversationStateV2(input: {
  conversationId: string;
  workspaceId: string;
  phoneNumber: string;
}): ConversationStateV2 {
  const now = new Date().toISOString();
  
  return {
    conversationId: input.conversationId,
    workspaceId: input.workspaceId,
    phoneNumber: input.phoneNumber,
    mode: 'receptive',
    network: 'unknown',
    service: 'unknown',
    intent: 'unknown',
    currentStep: 'greeting',
    customer: {
      hasAccount: false,
      hasBalance: false
    },
    payment: {},
    freeTest: {
      status: 'none'
    },
    tutorial: {
      active: false
    },
    support: {
      active: false
    },
    toolsUsed: [],
    loadedModules: [],
    facts: {},
    createdAt: now,
    updatedAt: now
  };
}

/**
 * Função pura para atualizar o estado da conversa com base em eventos
 */
export function updateConversationStateV2(
  previousState: ConversationStateV2,
  event: V2StateEvent
): ConversationStateV2 {
  const newState = { ...previousState, updatedAt: new Date().toISOString() };

  switch (event.type) {
    case 'mode_detected':
      newState.mode = event.value;
      break;
    
    case 'network_detected':
      // Mudança explícita de rede
      if (newState.network !== event.value) {
        newState.network = event.value;
        // Limpar serviço se mudar a rede (regrade de negócio: serviço é dependente da rede)
        newState.service = 'unknown';
      }
      break;

    case 'service_detected':
      newState.service = event.value;
      break;

    case 'intent_detected':
      newState.intent = event.value;
      break;

    case 'quantity_detected':
      newState.quantity = event.value;
      break;

    case 'customer_account_known':
      newState.customer = { ...newState.customer, hasAccount: event.value };
      break;

    case 'customer_balance_known':
      newState.customer = { ...newState.customer, hasBalance: event.value };
      break;

    case 'payment_country_detected':
      newState.customer = { ...newState.customer, country: event.value };
      break;

    case 'payment_method_selected':
      newState.payment = { ...newState.payment, preferredMethod: event.value };
      break;

    case 'free_test_offered':
      newState.freeTest = { ...newState.freeTest, status: 'offered' };
      break;

    case 'free_test_accepted':
      newState.freeTest = { ...newState.freeTest, status: 'accepted' };
      break;

    case 'free_test_waiting_link':
      newState.freeTest = { ...newState.freeTest, status: 'waiting_link' };
      break;

    case 'free_test_started':
      newState.freeTest = { ...newState.freeTest, status: 'started' };
      break;

    case 'free_test_completed':
      newState.freeTest = { ...newState.freeTest, status: 'completed' };
      break;

    case 'free_test_failed':
      newState.freeTest = { ...newState.freeTest, status: 'failed' };
      break;

    case 'tutorial_started':
      newState.tutorial = { ...newState.tutorial, active: true };
      break;

    case 'tutorial_step_changed':
      newState.tutorial = { ...newState.tutorial, currentStep: event.value };
      break;

    case 'support_detected':
      newState.support = { ...newState.support, active: true };
      newState.intent = 'support';
      newState.currentStep = 'support_redirect';
      break;

    case 'support_redirected':
      newState.support = { ...newState.support, active: true };
      break;

    case 'question_asked':
      newState.lastQuestion = event.value;
      break;

    case 'customer_answered':
      newState.lastAnswer = event.value;
      break;

    case 'conversation_closed':
      newState.currentStep = 'conversation_closed';
      break;

    case 'step_changed':
      newState.currentStep = event.value;
      break;
  }

  return newState;
}

/**
 * Resolve respostas curtas sem LLM baseado no contexto da última pergunta
 */
export function resolveShortAnswerFromState(message: string, state: ConversationStateV2): V2StateEvent | null {
  const normalized = message.toLowerCase().trim();
  const lastQ = state.lastQuestion;

  if (!lastQ) return null;

  // Detecção de Rede
  if (lastQ.includes('rede') || lastQ.includes('network') || lastQ.includes('ask_network')) {
    if (normalized.includes('spotify')) return { type: 'network_detected', value: 'spotify' };
    if (normalized.includes('instagram') || normalized.includes('estragam')) return { type: 'network_detected', value: 'instagram' };
    if (normalized.includes('youtube')) return { type: 'network_detected', value: 'youtube' };
    if (normalized.includes('tiktok')) return { type: 'network_detected', value: 'tiktok' };
  }

  // Detecção de Serviço
  if (lastQ.includes('serviço') || lastQ.includes('service') || lastQ.includes('ask_service')) {
    if (normalized.includes('playlist')) return { type: 'service_detected', value: 'playlist' };
    if (normalized.includes('seguidor') || normalized.includes('followers')) return { type: 'service_detected', value: 'followers' };
    if (normalized.includes('curtida') || normalized.includes('likes')) return { type: 'service_detected', value: 'likes' };
  }

  // Detecção de Quantidade
  if (lastQ.includes('quantidade') || lastQ.includes('quantity') || lastQ.includes('ask_quantity')) {
    const match = normalized.match(/\d+/);
    if (match) return { type: 'quantity_detected', value: parseInt(match[0]) };
  }

  // Respostas Sim/Não (Cadastro, Saldo, Teste Grátis)
  const isYes = ['sim', 'quero', 'yes', 'pode', 'bora'].some(word => normalized.includes(word));
  const isNo = ['não', 'nao', 'no', 'agora não', 'nem'].some(word => normalized.includes(word));

  if (lastQ.includes('cadastro') || lastQ.includes('conta') || lastQ.includes('account')) {
    if (isYes) return { type: 'customer_account_known', value: true };
    if (isNo) return { type: 'customer_account_known', value: false };
  }

  if (lastQ.includes('pagamento') || lastQ.includes('payment')) {
    if (normalized.includes('pix')) return { type: 'payment_method_selected', value: 'pix' };
    if (normalized.includes('cartão') || normalized.includes('cartao') || normalized.includes('credit')) return { type: 'payment_method_selected', value: 'credit_card' };
  }

  return null;
}

/**
 * Constrói um resumo curto e estruturado do estado para o prompt
 */
export function buildConversationStateSummaryV2(state: ConversationStateV2): string {
  const summary: string[] = [];
  
  if (state.mode) summary.push(`mode: ${state.mode}`);
  if (state.network !== 'unknown') summary.push(`network: ${state.network}`);
  if (state.service !== 'unknown') summary.push(`service: ${state.service}`);
  if (state.intent !== 'unknown') summary.push(`intent: ${state.intent}`);
  if (state.customer.hasAccount) summary.push(`has_account: true`);
  if (state.customer.hasBalance) summary.push(`has_balance: true`);
  if (state.currentStep) summary.push(`current_step: ${state.currentStep}`);
  if (state.lastQuestion) summary.push(`last_question: ${state.lastQuestion}`);
  if (state.quantity) summary.push(`quantity: ${state.quantity}`);

  return summary.join('\n');
}

/**
 * Repositório em memória para testes
 */
export class InMemoryConversationStateRepositoryV2 implements IConversationStateRepositoryV2 {
  private states = new Map<string, ConversationStateV2>();

  async get(conversationId: string): Promise<ConversationStateV2 | null> {
    return this.states.get(conversationId) || null;
  }

  async save(state: ConversationStateV2): Promise<void> {
    this.states.set(state.conversationId, state);
  }

  async delete(conversationId: string): Promise<void> {
    this.states.delete(conversationId);
  }
}

export interface IConversationStateRepositoryV2 {
  get(conversationId: string): Promise<ConversationStateV2 | null>;
  save(state: ConversationStateV2): Promise<void>;
  delete(conversationId: string): Promise<void>;
}
