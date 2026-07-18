/**
 * Agent Mind V2 - E2E Orchestrator Types
 */

import { ConversationStateV2, V2StateEvent } from './conversation-state.types';
import { RouteModulesV2Output, V2Tool } from './router.types';
import { RouteModelV2Output } from './model-router';
import { PromptBuilderOutputV2 } from './prompt-builder.types';
import { GuardEngineOutput } from './guard-engine.types';

export interface AgentV2E2EInput {
  workspaceId: string;
  conversationId: string;
  phoneNumber: string;
  currentMessage: string;
  previousState: ConversationStateV2;
  mode: 'receptive' | 'outbound';
  media?: {
    type: 'text' | 'image' | 'audio';
    hasImage?: boolean;
    hasAudio?: boolean;
  };
  shortHistory: { sender: 'agente' | 'cliente'; body: string }[];
  historySummary?: string;
  toolFixtures: Record<string, any>;
  modelConfig?: any;
  executionMode: 'isolated' | 'shadow' | 'real';
}

export interface AgentV2E2EOutput {
  stateBefore: ConversationStateV2;
  shortAnswerResolution: { resolved: boolean; response?: string } | null;
  routeResult: RouteModulesV2Output;
  stateAfterRouting: ConversationStateV2;
  modelRouteResult: RouteModelV2Output;
  promptBuildResult: PromptBuilderOutputV2 | null;
  modelResponse: string | null;
  guardResult: GuardEngineOutput | null;
  regenerationResult?: {
    instruction: string;
    modelResponse: string;
    guardResult: GuardEngineOutput;
  } | null;
  finalResponse: string;
  stateAfter: ConversationStateV2;
  metrics: Record<string, any>;
  errors: string[];
  sentToCustomer: boolean;
}
