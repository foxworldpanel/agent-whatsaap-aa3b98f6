import { IDiscoveryProvider, LeadDiscoveryResult } from "../types";
import { JobService } from "../job.service";
import { LeadService } from "../lead.service";

/**
 * Mock Discovery Provider
 * Generates simulated lead data for testing and Phase 1 demonstration.
 */
export class MockDiscoveryProvider implements IDiscoveryProvider {
  private isStopped = false;

  async search(query: Record<string, any>): Promise<LeadDiscoveryResult[]> {
    console.log("[MockProvider] Searching for leads with query:", query);
    this.isStopped = false;
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    if (this.isStopped) return [];

    const results: LeadDiscoveryResult[] = [
      {
        profile: {
          platform: 'instagram',
          username: 'dj_tech_official',
          displayName: 'DJ Tech',
          bio: 'Music & Technology enthusiast. DJ based in Berlin.',
          url: 'https://instagram.com/dj_tech_official'
        },
        contacts: {
          email: 'contact@djtech.example.com',
          phone: '+49123456789'
        },
        links: ['https://soundcloud.com/dj-tech', 'https://djtech.example.com'],
        metadata: { followers: 15000, post_count: 342 },
        rawData: { full_mock_response: true }
      },
      {
        profile: {
          platform: 'instagram',
          username: 'art_by_julia',
          displayName: 'Julia Art',
          bio: 'Digital artist | NFTs | Creative coder',
          url: 'https://instagram.com/art_by_julia'
        },
        contacts: {
          email: 'julia@art.example.com'
        },
        links: ['https://opensea.io/julia-art'],
        metadata: { followers: 5400, post_count: 128 },
        rawData: { full_mock_response: true }
      }
    ];

    return results;
  }

  async collect(username: string): Promise<LeadDiscoveryResult> {
    console.log("[MockProvider] Collecting details for:", username);
    await new Promise(resolve => setTimeout(resolve, 800));
    
    return {
      profile: {
        platform: 'instagram',
        username: username,
        displayName: username.split('_').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' '),
      },
      contacts: { email: `${username}@example.com` },
      links: [],
      metadata: {},
      rawData: { manual_collection: true }
    };
  }

  async validate(config: Record<string, any>): Promise<boolean> {
    return !!config.api_key || config.mode === 'mock';
  }

  async stop(): Promise<void> {
    console.log("[MockProvider] Stopping...");
    this.isStopped = true;
  }
}
