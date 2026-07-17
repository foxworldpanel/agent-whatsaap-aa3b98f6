/**
 * Agent Mind V2 - Configuração de Modelos
 */

export const MODEL_CONFIG_V2 = {
  lightweightModel: 'claude-3-5-sonnet-20240620',
  strongModel: 'claude-3-5-sonnet-20240620',
  visionModel: 'claude-3-5-sonnet-20240620',
  transcriptionModel: 'whisper-1' 
};

export type V2ModelKey = keyof typeof MODEL_CONFIG_V2;

export type V2Complexity = 
  | 'deterministic' 
  | 'simple' 
  | 'moderate' 
  | 'complex' 
  | 'vision_required';

export type V2RoutingReason =
  | 'deterministic_state'
  | 'greeting'
  | 'simple_commercial'
  | 'price_lookup'
  | 'panel_guidance'
  | 'payment_guidance'
  | 'support_redirect'
  | 'free_test_flow'
  | 'audio_simple'
  | 'complex_message'
  | 'multi_intent'
  | 'objection_complex'
  | 'vision_required'
  | 'fallback_after_error';
