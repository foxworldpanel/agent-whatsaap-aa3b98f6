import { LeadDiscoveryResult } from "../types";

/**
 * AI Service (Mock for Phase 1)
 * Handles lead enrichment and scoring.
 * Core flow works even if this service is disabled.
 */
export class AIService {
  /**
   * Enriches lead data using AI.
   * Currently a mock for Phase 1.
   */
  static async enrichLead(leadId: string): Promise<void> {
    console.log(`[Mock AI] Enriching lead ${leadId}...`);
    // In Phase 2, this will call LLMs to extract details from bio/links
    return Promise.resolve();
  }

  /**
   * Calculates a lead score based on profile data.
   * Currently a mock for Phase 1.
   */
  static async scoreLead(leadId: string): Promise<{ score: number; reason: string }> {
    console.log(`[Mock AI] Scoring lead ${leadId}...`);
    return {
      score: 75,
      reason: "High engagement profile (Mock)"
    };
  }
}
