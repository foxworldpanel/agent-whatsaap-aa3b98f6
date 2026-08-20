import { supabase } from "@/integrations/supabase/client";

/**
 * Standardized lead discovery result.
 * All providers must return this object.
 */
export interface LeadDiscoveryResult {
  profile: {
    platform: string;
    username: string;
    url?: string;
    displayName?: string;
    bio?: string;
    website?: string;
    profilePicUrl?: string;
  };
  contacts: {
    phone?: string;
    email?: string;
  };
  links: string[];
  metadata: Record<string, any>;
  rawData: Record<string, any>;
}

/**
 * Interface for discovery providers.
 * Providers must be stateless.
 */
export interface IDiscoveryProvider {
  /**
   * Searches for leads based on query configuration.
   */
  search(query: Record<string, any>): Promise<LeadDiscoveryResult[]>;
  
  /**
   * Collects detailed data for a specific profile.
   */
  collect(username: string): Promise<LeadDiscoveryResult>;
  
  /**
   * Validates if the provider configuration is correct.
   */
  validate(config: Record<string, any>): Promise<boolean>;
  
  /**
   * Stops any ongoing discovery process.
   */
  stop(): Promise<void>;
}

/**
 * Lead Sales Status Enum
 */
export type LeadSalesStatus = 'NEW' | 'QUEUED' | 'CONTACTED' | 'RESPONDED' | 'QUALIFIED' | 'CONVERTED' | 'LOST';

/**
 * Lead Pipeline Stage Enum
 */
export type LeadPipelineStage = 'DISCOVERED' | 'ENRICHED' | 'READY_FOR_SALES' | 'IN_CAMPAIGN' | 'CONTACTED' | 'RESPONDED' | 'QUALIFIED' | 'CUSTOMER';

/**
 * Job Status Enum
 */
export type JobStatus = 'PENDING' | 'RUNNING' | 'FINISHED' | 'FAILED' | 'PAUSED' | 'CANCELLED';
