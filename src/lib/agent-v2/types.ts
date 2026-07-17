/**
 * Agent Mind V2 - Tipos Base
 */

/**
 * Tipos de controle interno. Mantidos apenas por compatibilidade com snapshots
 * do banco e histórico. NÃO usar no fluxo ativo de novas funcionalidades.
 */
export type BrainVersion = 'v2_shadow' | 'v2_pilot' | 'v2';

export type ExecutionMode = 'production' | 'shadow' | 'pilot';

/**
 * Tipo ATIVO usado pelo resolver e pelo webhook.
 * - 'v2'       → cérebro oficial, executado apenas para números autorizados.
 * - 'disabled' → IA totalmente desligada para o número; nenhuma chamada
 *                a Claude, prompt, ferramenta ou métrica é permitida.
 *
 * A arquitetura anterior está totalmente desativada.
 */
export type ActiveBrainVersion = 'v2' | 'disabled';


export interface AgentV2State {
  version: BrainVersion;
  mode: ExecutionMode;
  context: {
    network?: string;
    service?: string;
    intent?: string;
    stage: string;
  };
  lastMessage?: string;
}

export interface ServiceSummary {
  id: string;
  name: string;
  network: string;
  pricePer1000: number;
  minQuantity: number;
  maxQuantity: number;
  category: string;
  active: boolean;
}

export interface ServiceDetail extends ServiceSummary {
  description?: string;
  averageTime?: string;
  requirements?: string[];
}

export interface PriceCalculation {
  serviceId: string;
  quantity: number;
  totalPrice: number;
  unitPrice: number;
}

export interface AgentV2Log {
  received_message: string;
  structured_state: any;
  mode: ExecutionMode;
  brain_version: BrainVersion;
  network?: string;
  service?: string;
  intent?: string;
  selected_modules: string[];
  selected_tools: string[];
  final_prompt: string;
  v2_response: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost: number;
  model: string;
  routing_reason?: string;
  duration_ms: number;
  v1_comparison?: {
    diff_tokens: number;
    diff_intent: boolean;
    v1_response_preview: string;
  };
  sent_to_customer: boolean;
}
