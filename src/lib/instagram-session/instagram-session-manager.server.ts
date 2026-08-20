
import { supabase } from '@/integrations/supabase/client';
import { InstagramSessionInfo, InstagramSessionStatus } from './types';

const logger = (event: string, details?: any) => {
  console.log(`[SessionManager] [${new Date().toISOString()}] ${event}`, details || '');
};

/**
 * Placeholder for External Worker Integration.
 * Playwright has been removed to fix build issues.
 */
export class InstagramSessionManager {
  static async connect(): Promise<InstagramSessionInfo | null> {
    logger('External Worker Integration Needed');
    throw new Error('BROWSER_AUTOMATION_OFFLOADED: Playwright removed. Implement external worker API call.');
  }

  static async disconnect(credentialId: string): Promise<void> {
    logger('Disconnect Started', { credentialId });
    await this.updateStatus(credentialId, 'DISCONNECTED');
  }

  static async reconnect(credentialId: string): Promise<InstagramSessionInfo | null> {
    return await this.connect();
  }

  static async validate(credentialId: string): Promise<InstagramSessionStatus> {
    logger('Validation Placeholder', { credentialId });
    return 'EXPIRED';
  }

  static async remove(credentialId: string): Promise<void> {
    const { error } = await supabase
      .from('lead_finder_credentials')
      .delete()
      .eq('id', credentialId);
    if (error) throw error;
  }

  static async listSessions(): Promise<InstagramSessionInfo[]> {
    const { data, error } = await supabase
      .from('lead_finder_credentials')
      .select('*')
      .eq('platform', 'instagram');
    if (error) throw error;
    return data as unknown as InstagramSessionInfo[];
  }

  private static async updateStatus(credentialId: string, status: InstagramSessionStatus) {
    await supabase
      .from('lead_finder_credentials')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', credentialId);
  }
}
