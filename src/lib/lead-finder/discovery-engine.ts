import { IDiscoveryProvider, LeadDiscoveryResult } from "./types";
import { InstagramPublicProvider } from "./providers/instagram-public";
import { MockDiscoveryProvider } from "./providers/mock-provider";

/**
 * Discovery Engine
 * Orchestrates provider selection, normalization, and execution.
 */
export class DiscoveryEngine {
  private providers: Map<string, IDiscoveryProvider> = new Map();

  constructor() {
    // Phase 2: Auto-register default providers
    this.registerProvider('mock', new MockDiscoveryProvider());
    this.registerProvider('instagram_public', new InstagramPublicProvider());
  }

  /**
   * Registers a new discovery provider.
   */
  registerProvider(key: string, provider: IDiscoveryProvider) {
    this.providers.set(key, provider);
  }

  /**
   * Gets a provider by key.
   */
  getProvider(key: string): IDiscoveryProvider | undefined {
    return this.providers.get(key);
  }

  /**
   * Normalizes provider output (Basic implementation for Phase 1).
   * This ensures all internal system components see a unified data structure.
   */
  normalize(result: LeadDiscoveryResult): LeadDiscoveryResult {
    // Basic normalization: trim strings, lowercase usernames, ensure links is an array
    return {
      ...result,
      profile: {
        ...result.profile,
        platform: result.profile.platform.trim(),
        username: result.profile.username.trim().toLowerCase(),
      },
      contacts: {
        phone: result.contacts.phone?.replace(/\s+/g, ''),
        email: result.contacts.email?.trim().toLowerCase(),
      },
      links: Array.isArray(result.links) ? result.links.map(l => l.trim()) : [],
    };
  }
}

// Global instance
export const discoveryEngine = new DiscoveryEngine();
