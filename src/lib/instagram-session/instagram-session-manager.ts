import { supabase } from '@/integrations/supabase/client';
import { PlaywrightSessionService } from './playwright-session.service';
import { SessionStorageService } from './session-storage.service';
import { SessionValidatorService } from './session-validator.service';
import { InstagramSessionInfo, InstagramSessionStatus } from './types';

export class InstagramSessionManager {
  static async connect(credentialId: string): Promise<InstagramSessionInfo | null> {
    await this.updateStatus(credentialId, 'connecting');

    const result = await PlaywrightSessionService.openLoginFlow(credentialId);

    if (result.success) {
      const storageStatePath = SessionStorageService.getStoragePath(credentialId);
      const now = new Date().toISOString();
      
      const { data, error } = await supabase
        .from('lead_finder_credentials')
        .update({
          status: 'connected',
          username: result.username,
          display_name: result.display_name,
          storage_state_path: storageStatePath,
          last_login: now,
          last_validation: now,
          updated_at: now
        })
        .eq('id', credentialId)
        .select()
        .single();

      if (error) throw error;
      
      console.log(`[SessionManager] Credential ${credentialId} connected as ${result.username}`);
      return data as unknown as InstagramSessionInfo;
    } else {
      await this.updateStatus(credentialId, 'error');
      return null;
    }
  }

  static async disconnect(credentialId: string): Promise<void> {
    await SessionStorageService.removeSession(credentialId);
    await this.updateStatus(credentialId, 'disconnected');
    console.log(`[SessionManager] Credential ${credentialId} disconnected`);
  }

  static async reconnect(credentialId: string): Promise<InstagramSessionInfo | null> {
    return await this.connect(credentialId);
  }

  static async validate(credentialId: string): Promise<InstagramSessionStatus> {
    const isValid = await SessionValidatorService.validate(credentialId);
    const status: InstagramSessionStatus = isValid ? 'connected' : 'expired';
    
    await supabase
      .from('lead_finder_credentials')
      .update({ 
        status, 
        last_validation: new Date().toISOString() 
      })
      .eq('id', credentialId);

    return status;
  }

  static async remove(credentialId: string): Promise<void> {
    await SessionStorageService.removeSession(credentialId);
    const { error } = await supabase
      .from('lead_finder_credentials')
      .delete()
      .eq('id', credentialId);
    
    if (error) throw error;
    console.log(`[SessionManager] Credential ${credentialId} removed`);
  }

  static async listSessions(): Promise<InstagramSessionInfo[]> {
    const { data, error } = await supabase
      .from('lead_finder_credentials')
      .select('*')
      .eq('platform', 'instagram');
    
    if (error) throw error;
    return data as unknown as InstagramSessionInfo[];
  }

  static async getSession(credentialId: string): Promise<InstagramSessionInfo | null> {
    const { data, error } = await supabase
      .from('lead_finder_credentials')
      .select('*')
      .eq('id', credentialId)
      .single();
    
    if (error) return null;
    return data as unknown as InstagramSessionInfo;
  }

  private static async updateStatus(credentialId: string, status: InstagramSessionStatus) {
    await supabase
      .from('lead_finder_credentials')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', credentialId);
  }
}
