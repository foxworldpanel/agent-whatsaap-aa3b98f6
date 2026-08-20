import { supabase } from "@/integrations/supabase/client";
import { LeadDiscoveryResult, LeadSalesStatus, LeadPipelineStage } from "./types";

/**
 * Lead Service
 * Handles persistence, deduplication, and timeline management.
 */
export class LeadService {
  /**
   * Lists leads with filters.
   */
  static async listLeads(filters: {
    platform?: string;
    email?: boolean;
    phone?: boolean;
    status?: LeadSalesStatus;
    search?: string;
  } = {}) {
    let query = supabase.from('lead_finder_leads').select('*, lead_finder_tags(tag)');

    if (filters.platform) query = query.eq('platform', filters.platform);
    if (filters.status) query = query.eq('sales_status', filters.status);
    if (filters.email) query = query.not('email', 'is', null);
    if (filters.phone) query = query.not('phone', 'is', null);
    
    if (filters.search) {
      query = query.or(`profile_username.ilike.%${filters.search}%,display_name.ilike.%${filters.search}%`);
    }

    const { data, error } = await query.order('discovered_at', { ascending: false });
    if (error) throw error;
    return data;
  }

  /**
   * Persists a discovered lead to the database.
   * Includes intelligent deduplication.
   */
  static async saveLead(result: LeadDiscoveryResult, origin: string, originValue: string) {
    const { profile, contacts, links, metadata, rawData } = result;

    // 1. Normalization
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
      raw_profile_data: { 
        ...rawData, 
        profile_pic_url: profile.profilePicUrl 
      },
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
    await this.addTimelineEvent(lead.id, `Discovered via ${origin}: ${originValue}`, { result });

    return lead;
  }

  /**
   * Gets timeline for a specific lead.
   */
  static async getTimeline(leadId: string) {
    const { data, error } = await supabase
      .from('lead_finder_timeline')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data;
  }

  /**
   * Adds a timeline event for a lead.
   */
  static async addTimelineEvent(leadId: string, event: string, metadata: any = {}) {
    const { error } = await supabase
      .from('lead_finder_timeline')
      .insert({ lead_id: leadId, event, metadata });
    
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

  /**
   * Deletes a lead.
   */
  static async deleteLead(leadId: string) {
    const { error } = await supabase
      .from('lead_finder_leads')
      .delete()
      .eq('id', leadId);
    
    if (error) throw error;
  }
}
