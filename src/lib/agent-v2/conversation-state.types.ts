/**
 * Agent Mind V2 - Gerenciamento de Estado da Conversa
 */

export type V2Mode = 'receptive' | 'outbound';

export type V2Network = 
  | 'spotify' 
  | 'instagram' 
  | 'youtube' 
  | 'tiktok' 
  | 'facebook' 
  | 'kwai' 
  | 'unknown';

export type V2Intent = 
  | 'greeting'
  | 'general_question'
  | 'discover_network'
  | 'discover_service'
  | 'discover_quantity'
  | 'price'
  | 'comparison'
  | 'buy'
  | 'tutorial'
  | 'payment'
  | 'free_test'
  | 'support'
  | 'goodbye'
  | 'unknown';

export type V2Step =
  | 'greeting'
  | 'discovering_network'
  | 'discovering_service'
  | 'discovering_quantity'
  | 'presenting_solution'
  | 'handling_objection'
  | 'offering_free_test'
  | 'tutorial_registration'
  | 'tutorial_recharge'
  | 'tutorial_order'
  | 'waiting_payment'
  | 'waiting_order'
  | 'sale_completed'
  | 'support_redirect'
  | 'conversation_closed';

export interface V2CustomerInfo {
  hasAccount: boolean;
  hasBalance: boolean;
  country?: string;
}

export interface V2PaymentInfo {
  preferredMethod?: string;
  status?: 'pending' | 'completed' | 'failed';
}

export interface V2FreeTestInfo {
  status: 'none' | 'offered' | 'accepted' | 'waiting_link' | 'started' | 'completed' | 'failed';
  link?: string;
}

export interface V2TutorialInfo {
  active: boolean;
  currentStep?: string;
}

export interface V2SupportInfo {
  active: boolean;
  ticketId?: string;
}

export interface ConversationStateV2 {
  conversationId: string;
  workspaceId: string;
  phoneNumber: string;
  mode: V2Mode;
  network: V2Network;
  service: V2Network | 'playlist' | 'followers' | 'likes' | 'views' | 'unknown' | string; // Permitindo flexibilidade mas mantendo enums
  intent: V2Intent;
  currentStep: V2Step;
  customer: V2CustomerInfo;
  payment: V2PaymentInfo;
  freeTest: V2FreeTestInfo;
  tutorial: V2TutorialInfo;
  support: V2SupportInfo;
  lastQuestion?: string;
  lastAnswer?: string;
  quantity?: number;
  link?: string;
  toolsUsed: string[];
  loadedModules: string[];
  facts: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export type V2StateEvent =
  | { type: 'mode_detected'; value: V2Mode }
  | { type: 'network_detected'; value: V2Network }
  | { type: 'service_detected'; value: string }
  | { type: 'intent_detected'; value: V2Intent }
  | { type: 'quantity_detected'; value: number }
  | { type: 'customer_account_known'; value: boolean }
  | { type: 'customer_balance_known'; value: boolean }
  | { type: 'payment_country_detected'; value: string }
  | { type: 'payment_method_selected'; value: string }
  | { type: 'free_test_offered' }
  | { type: 'free_test_accepted' }
  | { type: 'free_test_waiting_link' }
  | { type: 'free_test_started' }
  | { type: 'free_test_completed' }
  | { type: 'free_test_failed' }
  | { type: 'tutorial_started' }
  | { type: 'tutorial_step_changed'; value: string }
  | { type: 'support_detected' }
  | { type: 'support_redirected' }
  | { type: 'question_asked'; value: string }
  | { type: 'customer_answered'; value: string }
  | { type: 'conversation_closed' }
  | { type: 'step_changed'; value: V2Step };

export interface IConversationStateRepositoryV2 {
  get(conversationId: string): Promise<ConversationStateV2 | null>;
  save(state: ConversationStateV2): Promise<void>;
  delete(conversationId: string): Promise<void>;
}
