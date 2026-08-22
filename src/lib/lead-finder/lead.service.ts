import { supabase } from "@/integrations/supabase/client";
import { LeadDiscoveryResult, LeadSalesStatus, LeadPipelineStage } from "./types";
import { Database } from "@/integrations/supabase/types";

type LeadUpdate = Database['public']['Tables']['lead_finder_leads']['Update'];
type LeadInsert = Database['public']['Tables']['lead_finder_leads']['Insert'];

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
    if (filters.status) query = query.eq('sales_status', filters.status as any);
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
    const normalizedLead: LeadInsert = {
      platform: profile.platform.toLowerCase(),
      profile_username: profile.username.toLowerCase(),
      profile_url: profile.url,
      display_name: profile.displayName,
      bio: profile.bio,
      website: profile.website,
      phone: contacts.phone,
      email: contacts.email,
      links: links as any,
      // Achado em 21/08/2026: segment vinha em metadata mas nunca era
      // extraído pra coluna própria — ficava perdido dentro do JSON.
      segment: metadata?.segment || null,
      lead_origin: origin,
      lead_origin_value: originValue,
      raw_profile_data: { 
        ...rawData, 
        profile_pic_url: profile.profilePicUrl 
      } as any,
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
      .insert({ lead_id: leadId, event, metadata: metadata as any } as any);
    
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
    const update: LeadUpdate = { updated_at: new Date().toISOString() };
    if (stage) update.pipeline_stage = stage as any;
    if (salesStatus) update.sales_status = salesStatus as any;

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

  /**
   * Retorna os usernames já conhecidos pra uma origem específica (ex:
   * a mesma hashtag buscada antes) — usado pra "continuar de onde
   * parou": evita visitar de novo perfis já descobertos numa busca
   * anterior com a mesma origem.
   */
  static async getKnownUsernamesByOrigin(origin: string, originValue: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('lead_finder_leads')
      .select('profile_username')
      .eq('lead_origin', origin)
      .eq('lead_origin_value', originValue);

    if (error) throw error;
    return (data || []).map((row) => row.profile_username);
  }

  /**
   * A ponte que faltava — achado real em 21/08/2026: o Lead Finder e o
   * sistema de disparo eram dois mundos separados. Um lead descoberto
   * nunca virava um "contact" de verdade, então nunca podia ser
   * abordado pelo agente. Essa função cria (ou reaproveita, se o
   * telefone já existir) o contato real, e avança o estágio do lead.
   */
  static async promoteToContact(leadId: string, userId: string): Promise<{ contactId: string; alreadyExisted: boolean }> {
    const { data: lead, error: leadError } = await supabase
      .from('lead_finder_leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (leadError) throw leadError;
    if (!lead.phone) throw new Error('Lead sem telefone não pode virar contato de disparo.');

    // Reaproveita se o telefone já é um contato conhecido — evita
    // duplicar e evita reiniciar o histórico de abordagem de alguém
    // que já está na base.
    const { data: existente } = await supabase
      .from('contacts')
      .select('id')
      .eq('user_id', userId)
      .eq('telefone', lead.phone)
      .maybeSingle();

    let contactId: string;
    let alreadyExisted = false;

    if (existente) {
      contactId = existente.id;
      alreadyExisted = true;
    } else {
      const { data: novoContato, error: contactError } = await supabase
        .from('contacts')
        .insert({
          user_id: userId,
          nome: lead.display_name || lead.profile_username,
          telefone: lead.phone,
          instagram: lead.profile_username,
          source: 'lead_finder',
          perfil: 'frio',
          status: 'nao_abordado',
        })
        .select('id')
        .single();

      if (contactError) throw contactError;
      contactId = novoContato.id;
    }

    await supabase
      .from('lead_finder_leads')
      .update({ pipeline_stage: 'READY_FOR_SALES', sales_status: 'QUEUED' })
      .eq('id', leadId);

    await this.addTimelineEvent(leadId, alreadyExisted ? 'PROMOTED_EXISTING_CONTACT' : 'PROMOTED_TO_CONTACT', { contactId });

    return { contactId, alreadyExisted };
  }
}
