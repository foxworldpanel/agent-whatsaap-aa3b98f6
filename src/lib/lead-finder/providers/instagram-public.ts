import { IDiscoveryProvider, LeadDiscoveryResult } from "../types";

export class InstagramPublicProvider implements IDiscoveryProvider {
  private isStopped = false;

  async search(query: Record<string, any>): Promise<LeadDiscoveryResult[]> {
    console.log("[InstagramPublicProvider] Searching with query:", query);
    this.isStopped = false;

    // Phase 2: Instagram Public simulation
    // Supports 'profile' type with 'username'
    if (query.type === 'profile' && query.username) {
      const result = await this.collect(query.username);
      return [result];
    }
    
    // In Phase 2, we could also support 'hashtag' or 'location' search simulations
    return [];
  }

  async collect(username: string): Promise<LeadDiscoveryResult> {
    console.log("[InstagramPublicProvider] Collecting public data for:", username);
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    if (this.isStopped) {
      throw new Error("Provider stopped by user");
    }

    const cleanUsername = username.replace(/^@/, '').toLowerCase();

    // Data mapped from public profile simulation
    return {
      profile: {
        platform: 'instagram',
        username: cleanUsername,
        url: `https://www.instagram.com/${cleanUsername}/`,
        displayName: this.generateDisplayName(cleanUsername),
        bio: `Especialista em marketing digital. 🚀\nConsultoria e estratégias para negócios locais.\n📍 São Paulo, SP`,
        website: `https://${cleanUsername}.com.br`
      },
      contacts: {
        email: `${cleanUsername}@gmail.com`,
        phone: '+5511988887777'
      },
      links: [
        `https://wa.me/5511988887777`,
        `https://linktr.ee/${cleanUsername}`
      ],
      metadata: {
        is_business_account: true,
        category: 'Business Consultant',
        follower_count: 5420,
        following_count: 890,
        post_count: 156,
        is_private: false,
        is_verified: false
      },
      rawData: {
        timestamp: new Date().toISOString(),
        source: 'instagram_public_web_simulator',
        version: '1.0.0'
      }
    };
  }

  async validate(config: Record<string, any>): Promise<boolean> {
    // Basic validation for credentials if needed in future
    return true;
  }

  async stop(): Promise<void> {
    this.isStopped = true;
    console.log("[InstagramPublicProvider] Stop signal received");
  }

  private generateDisplayName(username: string): string {
    return username
      .split(/[._]/)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
}
