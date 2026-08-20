import { IDiscoveryProvider, LeadDiscoveryResult } from "../types";

/**
 * Instagram Public Provider
 * Extracts public profile information from Instagram profiles.
 * 
 * DESIGN RULE: Strictly stateless. No DB writes, no AI calls.
 * This provider only performs network requests to extract public data
 * and returns a LeadDiscoveryResult.
 */
export class InstagramPublicProvider implements IDiscoveryProvider {
  private isStopped = false;

  /**
   * Search for leads on Instagram.
   * For Phase 2, we support search by profile username.
   */
  async search(query: Record<string, any>): Promise<LeadDiscoveryResult[]> {
    console.log("[InstagramPublicProvider] Searching with query:", query);
    this.isStopped = false;

    if (query.type === 'profile' && query.username) {
      const result = await this.collect(query.username);
      return [result];
    }

    // Future implementations for hashtag or keyword search would go here
    return [];
  }

  /**
   * Collects detailed data for a specific Instagram profile.
   * In a real implementation, this would use an external API or a browser-based crawler.
   * For Phase 2, we implement a simulator that extracts "real-like" data 
   * from a simulated public profile view to demonstrate the architecture.
   */
  async collect(username: string): Promise<LeadDiscoveryResult> {
    console.log("[InstagramPublicProvider] Collecting public data for:", username);
    
    // Cleanup username (remove @)
    const cleanUsername = username.replace(/^@/, '').toLowerCase();
    
    // Simulate network latency
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    if (this.isStopped) {
      throw new Error("Provider stopped");
    }

    // In a production environment, this is where we would:
    // 1. Fetch https://www.instagram.com/${cleanUsername}/
    // 2. Parse the HTML/JSON shared data
    // 3. Extract metadata
    
    // SIMULATION: Returning structured data based on the provided username
    // to validate the pipeline.
    const result: LeadDiscoveryResult = {
      profile: {
        platform: 'instagram',
        username: cleanUsername,
        url: `https://www.instagram.com/${cleanUsername}/`,
        displayName: this.generateDisplayName(cleanUsername),
        bio: `Bio for ${cleanUsername}. Public information extracted from Instagram. #LeadFinder`,
        website: `https://${cleanUsername}.com`
      },
      contacts: {
        // Publicly available contact info often found in bios or external links
        email: `${cleanUsername}@example.com`,
        phone: '+551199999999'
      },
      links: [
        `https://linktr.ee/${cleanUsername}`,
        `https://twitter.com/${cleanUsername}`
      ],
      metadata: {
        is_business_account: true,
        category: 'Personal Blog',
        follower_count: 1250,
        following_count: 300,
        post_count: 42,
        is_private: false,
        is_verified: false
      },
      rawData: {
        timestamp: new Date().toISOString(),
        source: 'instagram_public_web',
        simulation: true
      }
    };

    return result;
  }

  async validate(config: Record<string, any>): Promise<boolean> {
    // For Phase 2, we don't require credentials for public profiles
    return true;
  }

  async stop(): Promise<void> {
    console.log("[InstagramPublicProvider] Stopping...");
    this.isStopped = true;
  }

  private generateDisplayName(username: string): string {
    return username
      .split(/[._]/)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
}
