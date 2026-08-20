import { supabase } from '@/integrations/supabase/client';
import { PlaywrightSessionService } from './playwright-session.service';
import { SessionStorageService } from './session-storage.service';
import { SessionValidatorService } from './session-validator.service';
import { InstagramSessionInfo, InstagramSessionStatus } from './types';

export class InstagramSessionManager {
  static async connect(): Promise<InstagramSessionInfo | null> {
    console.log(`[SessionManager] ${new Date().toISOString()} Starting connection flow...`);
    
    // 1. Open login flow via Playwright (NO credentialId yet)
    const result = await PlaywrightSessionService.openLoginFlow();

    if (result.success && result.username) {
      console.log(`[SessionManager] ${new Date().toISOString()} Login success for ${result.username}. Persisting...`);
      
      const { data: { user } } = await supabase.auth.getUser();
      
      // 2. Create or Update credential after successful login
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('lead_finder_credentials')
        .upsert({
          platform: 'instagram',
          provider_type: 'instagram',
          account_name: result.display_name || result.username,
          username: result.username,
          display_name: result.display_name,
          profile_picture: result.profile_picture,
          status: 'connected' as InstagramSessionStatus,
          last_login: now,
          last_validation: now,
          updated_at: now,
          created_by: user?.id
        }, { onConflict: 'username' })
        .select()
        .single();

      if (error) {
        console.error(`[SessionManager] ${new Date().toISOString()} Error persisting credential:`, error);
        throw error;
      }

      const credentialId = data.id;
      const storageStatePath = SessionStorageService.getStoragePath(credentialId);
      
      // 3. Save storage state with the real ID
      if (result.storageState) {
        await SessionStorageService.saveSession(credentialId, result.storageState);
        
        // 4. Update the storage path in DB
        await supabase
          .from('lead_finder_credentials')
          .update({ storage_state_path: storageStatePath })
          .eq('id', credentialId);
      }
      
      console.log(`[SessionManager] ${new Date().toISOString()} Credential ${credentialId} connected as ${result.username}`);
      
      // 5. Final Real Validation
      const finalStatus = await this.validate(credentialId);
      if (finalStatus !== 'connected') {
         console.warn(`[SessionManager] ${new Date().toISOString()} Initial validation failed for ${result.username}`);
      }

      return {
        ...data,
        status: finalStatus
      } as unknown as InstagramSessionInfo;
    } else {
      console.error(`[SessionManager] ${new Date().toISOString()} Connection failed:`, result.error);
      return null;
    }
  }

  static async disconnect(credentialId: string): Promise<void> {
    console.log(`[SessionManager] ${new Date().toISOString()} Disconnecting ${credentialId}`);
    await SessionStorageService.removeSession(credentialId);
    await this.updateStatus(credentialId, 'disconnected');
  }

  static async reconnect(credentialId: string): Promise<InstagramSessionInfo | null> {
    console.log(`[SessionManager] ${new Date().toISOString()} Reconnecting ${credentialId}`);
    // Reconnect uses the same flow as connect, but we might want to pre-load something if needed
    // For now, standard connect is safer to ensure fresh session
    return await this.connect();
  }

  static async validate(credentialId: string): Promise<InstagramSessionStatus> {
    console.log(`[SessionManager] ${new Date().toISOString()} Validating session for ${credentialId}`);
    const isValid = await SessionValidatorService.validate(credentialId);
    const status: InstagramSessionStatus = isValid ? 'connected' : 'expired';
    
    await supabase
      .from('lead_finder_credentials')
      .update({ 
        status, 
        last_validation: new Date().toISOString() 
      })
      .eq('id', credentialId);

    console.log(`[SessionManager] ${new Date().toISOString()} Validation result for ${credentialId}: ${status}`);
    return status;
  }

  static async remove(credentialId: string): Promise<void> {
    console.log(`[SessionManager] ${new Date().toISOString()} Removing ${credentialId}`);
    await SessionStorageService.removeSession(credentialId);
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
