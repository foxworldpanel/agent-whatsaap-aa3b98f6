import { supabase } from "@/integrations/supabase/client";
import { LeadDiscoveryResult, LeadSalesStatus, LeadPipelineStage } from "./types";

/**
 * Lead Service
 * Handles persistence, deduplication, and timeline management.
 */
export class LeadService {
  /**
   * Persists a discovered lead to the database.
   * Includes intelligent deduplication.
   */
  static async saveLead(result: LeadDiscoveryResult, origin: string, originValue: string) {
    const { profile, contacts, links, metadata, rawData } = result;

    // 1. Normalization (Basic Phase 1)
    const normalizedLead = {
      platform: profile.platform.toLowerCase(),
      profile_username: profile.username.toLowerCase(),
      profile_url: profile.url,
      display_name: profile.displayName,
      bio: profile.bio,
      website: profile.website,
      phone: contacts.phone,
      email: contacts.email,
      links: links,
      lead_origin: origin,
      lead_origin_value: originValue,
      raw_profile_data: rawData,
      discovered_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    };

    // 2. Upsert (Deduplication by platform + username)
    const { data: lead, error } = await supabase
      .from('lead_finder_leads')
      .upsert(normalizedLead, { 
        onConflict: 'platform,profile_username',
        ignoreDuplicates: false 
      })
      .select()
      .single();

    if (error) throw error;
    if (!lead) throw new Error("Failed to save lead");

    // 3. Register Timeline
    await this.addTimelineEvent(lead.id, `Discovered via ${origin}: ${originValue}`);

    return lead;
  }

  /**
   * Adds a timeline event for a lead.
   */
  static async addTimelineEvent(leadId: string, event: string) {
    const { error } = await supabase
      .from('lead_finder_timeline')
      .insert({ lead_id: leadId, event });
    
    if (error) console.error("Failed to add timeline event:", error);
  }

  /**
   * Adds tags to a lead.
   */
  static async addTags(leadId: string, tags: string[]) {
    if (!tags.length) return;
    
    const tagEntries = tags.map(tag => ({ lead_id: leadId, tag }));
    const { error } = await supabase
      .from('lead_finder_tags')
      .insert(tagEntries);
      
    if (error) console.error("Failed to add tags:", error);
  }

  /**
   * Updates lead status.
   */
  static async updateStatus(leadId: string, stage?: LeadPipelineStage, salesStatus?: LeadSalesStatus) {
    const update: any = { updated_at: new Date().toISOString() };
    if (stage) update.pipeline_stage = stage;
    if (salesStatus) update.sales_status = salesStatus;

    const { error } = await supabase
      .from('lead_finder_leads')
      .update(update)
      .eq('id', leadId);

    if (error) throw error;
    
    await this.addTimelineEvent(leadId, `Status updated: ${stage || ''} | ${salesStatus || ''}`);
  }
}
