import { supabase } from "@/integrations/supabase/client";

/**
 * Credential Service
 * Handles social media account management for discovery providers.
 */
export class CredentialService {
  /**
   * Lists all credentials for the current user.
   */
  static async listCredentials() {
    const { data, error } = await supabase
      .from('lead_finder_credentials')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  /**
   * Adds a new credential.
   */
  static async addCredential(params: {
    provider_type: string;
    account_name: string;
    username: string;
    config?: any;
  }) {
    const { data: { user } } = await supabase.auth.getUser();
    
    const { data, error } = await supabase
      .from('lead_finder_credentials')
      .insert({
        ...params,
        created_by: user?.id,
        status: 'never_connected'
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Removes a credential.
   */
  static async removeCredential(id: string) {
    const { error } = await supabase
      .from('lead_finder_credentials')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  /**
   * Updates credential status.
   */
  static async updateStatus(id: string, status: 'connected' | 'expired' | 'disconnected') {
    const { error } = await supabase
      .from('lead_finder_credentials')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
  }
}
