/**
 * Agent Mind V2 - Prompt Builder Types
 */

import { ConversationStateV2 } from './conversation-state.types';
import { RouteModulesV2Output, V2Module, V2Tool, V2Tutorial } from './router.types';

export interface PromptBuilderInputV2 {
  currentMessage: string;
  conversationState: ConversationStateV2;
  routeResult: RouteModulesV2Output;
  toolResults?: Record<string, any>;
  tutorialResults?: Record<string, any>;
  history: { sender: 'agente' | 'cliente'; body: string }[];
  historySummary?: string;
  brainVersion: string;
  builderVersion: string;
}

export interface BlockMetrics {
  name: string;
  chars: number;
  tokens: number;
}

export interface PromptBuilderOutputV2 {
  systemPrompt: string;
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  selectedModules: V2Module[];
  selectedTools: V2Tool[];
  selectedTutorials: V2Tutorial[];
  blockMetrics: BlockMetrics[];
  totalChars: number;
  estimatedTokens: number;
  cacheablePrefix: string;
  dynamicSuffix: string;
  warnings: string[];
  buildDurationMs: number;
  builderVersion: string;
}
