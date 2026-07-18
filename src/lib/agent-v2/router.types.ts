/**
 * Agent Mind V2 - Module Router Types
 */

import { ConversationStateV2, V2Intent, V2Network, V2StateEvent } from './conversation-state.types';

export type V2Module =
  | 'mission'
  | 'identity'
  | 'guards'
  | 'receptive'
  | 'outbound'
  | 'commercial'
  | 'spotify'
  | 'spotify_overview'
  | 'spotify_playlist'
  | 'spotify_followers'
  | 'instagram'
  | 'youtube'
  | 'tiktok'
  | 'facebook'
  | 'kwai'
  | 'panel'
  | 'payments'
  | 'tutorials'
  | 'free_test'
  | 'support';

export type V2Tool =
  | 'consultar_servicos'
  | 'teste_gratis'
  | 'enviar_audio';

export type V2Tutorial =
  | 'registration'
  | 'recharge'
  | 'order'
  | 'service_location'
  | 'link_field';

export interface RouteModulesV2Input {
  currentMessage: string;
  conversationState: ConversationStateV2;
  availableModules?: V2Module[];
  availableTools?: V2Tool[];
  availableTutorials?: V2Tutorial[];
}

export interface RouteModulesV2Output {
  selectedModules: V2Module[];
  selectedTools: V2Tool[];
  selectedTutorials: V2Tutorial[];
  detectedMode: 'receptive' | 'outbound';
  detectedNetwork: V2Network;
  detectedService: string;
  detectedIntent: V2Intent | V2Intent[];
  routingReason: string;
  stateEvents: V2StateEvent[];
  warnings: string[];
  metrics: {
    moduleCount: number;
    toolCount: number;
    tutorialCount: number;
    routingDurationMs: number;
    warningsCount: number;
  };
}
