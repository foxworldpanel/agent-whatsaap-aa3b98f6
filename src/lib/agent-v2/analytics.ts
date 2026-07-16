/**
 * Agent Mind V2 - Analytics Engine
 */

import { 
  AgentV2TurnAnalytics, 
  AgentV2ConversationAnalytics, 
  ModelPricingConfigV2,
  QualityFlags,
  CustomerStage
} from './analytics.types';
import { createHmac } from 'crypto';

// Mock config for now - will be replaced by DB queries in persistence.server.ts
const MODEL_PRICING: ModelPricingConfigV2[] = [
  {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20240620',
    effectiveFrom: '2024-06-20T00:00:00Z',
    inputPricePerMillion: 3.0,
    outputPricePerMillion: 15.0,
    cacheCreationPricePerMillion: 3.75,
    cacheReadPricePerMillion: 0.30,
    currency: 'USD',
    source: 'official',
    updatedAt: new Date().toISOString()
  },
  {
    provider: 'anthropic',
    model: 'claude-3-haiku-20240307',
    effectiveFrom: '2024-03-07T00:00:00Z',
    inputPricePerMillion: 0.25,
    outputPricePerMillion: 1.25,
    cacheCreationPricePerMillion: 0.30,
    cacheReadPricePerMillion: 0.03,
    currency: 'USD',
    source: 'official',
    updatedAt: new Date().toISOString()
  }
];

/**
 * Calculates the estimated cost of a turn based on token usage and model pricing.
 * Selection is based on the valid tariff for the call date.
 */
export function calculateEstimatedCost(
  model: string | null,
  tokens: {
    input: number;
    output: number;
    cacheCreation?: number;
    cacheRead?: number;
  },
  callDate: string = new Date().toISOString()
): { cost: number | null; warning?: string } {
  if (!model) return { cost: 0 };
  
  const now = new Date(callDate).getTime();
  
  // Selection logic: filter by model and ensure callDate is within effective range [from, until)
  const pricing = MODEL_PRICING.find(p => {
    const from = new Date(p.effectiveFrom).getTime();
    const until = p.effectiveUntil ? new Date(p.effectiveUntil).getTime() : Infinity;
    return p.model === model && now >= from && now < until;
  });

  if (!pricing) {
    return { cost: null, warning: 'pricing_config_missing' };
  }

  const inputCost = (tokens.input / 1_000_000) * pricing.inputPricePerMillion;
  const outputCost = (tokens.output / 1_000_000) * pricing.outputPricePerMillion;
  const cacheCreationCost = ((tokens.cacheCreation || 0) / 1_000_000) * pricing.cacheCreationPricePerMillion;
  const cacheReadCost = ((tokens.cacheRead || 0) / 1_000_000) * pricing.cacheReadPricePerMillion;

  return { cost: inputCost + outputCost + cacheCreationCost + cacheReadCost };
}

/**
 * Maps current state and intent to a standardized CustomerStage.
 */
export function determineCustomerStage(intent: string, currentStep: string): CustomerStage {
  if (currentStep === 'conversation_closed') return 'closed';
  
  switch (intent) {
    case 'greeting': return 'greeting';
    case 'discover_network': return 'discovering_network';
    case 'discover_service': return 'discovering_service';
    case 'pricing': return 'pricing';
    case 'buy': return 'purchase_intent';
    case 'support': return 'support';
    case 'goodbye': return 'closed';
    default:
      if (currentStep.includes('registration')) return 'registration';
      if (currentStep.includes('recharge')) return 'recharge';
      if (currentStep.includes('order')) return 'ordering';
      return 'new_lead';
  }
}

/**
 * Calculates quality scores based on applied flags.
 */
export function calculateQualityScores(flags: QualityFlags): {
  structural: number;
  commercial: number;
  safety: number;
  overall: number;
} {
  const categories = {
    structural: ['answeredDirectly', 'contextPreserved', 'oneMainQuestion', 'noRepeatedQuestion', 'naturalLength'],
    commercial: ['correctPlatform', 'correctService', 'correctPrice', 'toolGrounded', 'panelOnlyPayment', 'closeFlowCorrect'],
    safety: ['noForbiddenPromise', 'supportRedirectCorrect', 'passedGuards']
  };

  const calculate = (keys: string[]) => {
    let approved = 0;
    let applicable = 0;
    for (const key of keys) {
      const val = flags[key as keyof QualityFlags];
      if (val !== 'not_applicable') {
        applicable++;
        if (val === true) approved++;
      }
    }
    return applicable === 0 ? 0 : Math.round((approved / applicable) * 100);
  };

  const structural = calculate(categories.structural);
  const commercial = calculate(categories.commercial);
  const safety = calculate(categories.safety);
  
  const allKeys = [...categories.structural, ...categories.commercial, ...categories.safety];
  const overall = calculate(allKeys);

  return { structural, commercial, safety, overall };
}

/**
 * Hashes a phone number for privacy-compliant storage.
 * Uses HMAC-SHA256 with a workspace-scoped secret.
 * Returns null if the secret is missing to prevent insecure storage.
 */
export function hashPhoneNumber(phone: string, workspaceId: string): string | null {
  const secret = process.env.PHONE_HASH_SECRET;
  if (!secret) {
    console.error('[Analytics] CRITICAL: PHONE_HASH_SECRET is missing. Analytics persistence will be skipped.');
    return null;
  }
  
  // Normalize phone (simple version)
  const normalizedPhone = phone.replace(/\D/g, '');
  
  // Hash = HMAC_SHA256(key=secret, message=workspaceId + ":" + normalizedPhone)
  return createHmac('sha256', secret)
    .update(`${workspaceId}:${normalizedPhone}`)
    .digest('hex');
}
