/**
 * Agent Mind V2 - Guard Engine Types
 */

import { ConversationStateV2 } from './conversation-state.types';
import { RouteModulesV2Output, V2Module, V2Tool } from './router.types';
import { RouteModelV2Output } from './model-router.ts';

export type GuardAction = 'allow' | 'sanitize' | 'replace_minimal' | 'regenerate' | 'block';

export type GuardSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface GuardViolation {
  guard: string;
  action: GuardAction;
  severity: GuardSeverity;
  message: string;
}

export interface GuardEngineInput {
  draftResponse: string;
  currentMessage: string;
  conversationState: ConversationStateV2;
  routeResult: RouteModulesV2Output;
  modelRouteResult: RouteModelV2Output;
  selectedModules: V2Module[];
  selectedTools: V2Tool[];
  toolResults: Record<string, any>;
  executionMode: string;
}

export interface GuardEngineOutput {
  approved: boolean;
  finalResponse: string;
  violations: GuardViolation[];
  corrections: string[];
  triggeredGuards: string[];
  blocked: boolean;
  blockReason: string | null;
  requiresRegeneration: boolean;
  regenerationInstruction: string | null;
  metrics: {
    guardCount: number;
    triggeredGuards: number;
    violationCount: number;
    correctionCount: number;
    blocked: boolean;
    requiresRegeneration: boolean;
    responseCharsBefore: number;
    responseCharsAfter: number;
    guardDurationMs: number;
  };
}
