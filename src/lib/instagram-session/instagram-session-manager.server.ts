
import { supabase } from '@/integrations/supabase/client';
import { InstagramSessionInfo, InstagramSessionStatus } from './types';

const logger = (event: string, details?: any) => {
  console.log(`[SessionManager] [${new Date().toISOString()}] ${event}`, details || '');
};

export class InstagramSessionManager {
  static async connect(): Promise<InstagramSessionInfo | null> {
    logger('UI CLICK RECEIVED - Starting connect()');
    
    try {
      const { EnvironmentCheckService } = await import('./environment-check.service.server');
      logger('Starting Environment Check...');
      const env = await EnvironmentCheckService.checkEnvironment();
      logger('Environment Check Result', env);
      
      if (env.errors.length > 0) {
        logger('Environment Check FAILED with errors', env.errors);
        throw new Error(`Ambiente não suportado: ${env.errors.join(', ')}`);
      }

      if (!env.display) {
        logger('Environment Check WARNING: No DISPLAY detected. Using headless mode.');
      }

      const { PlaywrightSessionService } = await import('./playwright-session.service.server');
      logger('Calling PlaywrightSessionService.openLoginFlow()...');
      const result = await PlaywrightSessionService.openLoginFlow();

      if (result.success && result.username) {
        logger('Login Success', { username: result.username });
        
        const { data: { user } } = await supabase.auth.getUser();
        
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
            status: 'CONNECTED' as InstagramSessionStatus,
            last_login: now,
            last_validation: now,
            updated_at: now,
            created_by: user?.id
          }, { onConflict: 'username' })
          .select()
          .single();

        if (error) {
          logger('Credential Upsert Failed', error);
          throw error;
        }

        logger('Credential Upsert Success', { id: data.id });

        const { SessionStorageService } = await import('./session-storage.service.server');
        const credentialId = data.id;
        const storageStatePath = SessionStorageService.getStoragePath(credentialId);
        
        if (result.storageState) {
          await SessionStorageService.saveSession(credentialId, result.storageState);
          logger('Storage Saved', { path: storageStatePath });
          
          await supabase
            .from('lead_finder_credentials')
            .update({ storage_state_path: storageStatePath })
            .eq('id', credentialId);
        }
        
        const finalStatus = await this.validate(credentialId);
        return {
          ...data,
          status: finalStatus
        } as unknown as InstagramSessionInfo;
      } else {
        logger('Login Failed', { error: result.error });
        return null;
      }
    } catch (error) {
      logger('Login Error', error);
      throw error;
    }
  }

  static async disconnect(credentialId: string): Promise<void> {
    logger('Disconnect Started', { credentialId });
    const { SessionStorageService } = await import('./session-storage.service.server');
    await SessionStorageService.removeSession(credentialId);
    await this.updateStatus(credentialId, 'DISCONNECTED');
    logger('Disconnect Success');
  }

  static async reconnect(credentialId: string): Promise<InstagramSessionInfo | null> {
    logger('Reconnect Started', { credentialId });
    return await this.connect();
  }

  static async validate(credentialId: string): Promise<InstagramSessionStatus> {
    logger('Session Validated Started', { credentialId });
    const { SessionValidatorService } = await import('./session-validator.service.server');
    const isValid = await SessionValidatorService.validate(credentialId);
    const status: InstagramSessionStatus = isValid ? 'CONNECTED' : 'EXPIRED';
    
    await supabase
      .from('lead_finder_credentials')
      .update({ 
        status, 
        last_validation: new Date().toISOString() 
      })
      .eq('id', credentialId);

    logger('Session Validated Result', { status });
    return status;
  }

  static async remove(credentialId: string): Promise<void> {
    logger('Removing Session', { credentialId });
    const { SessionStorageService } = await import('./session-storage.service.server');
    await SessionStorageService.removeSession(credentialId);
    const { error } = await supabase
      .from('lead_finder_credentials')
      .delete()
      .eq('id', credentialId);
    
    if (error) throw error;
    logger('Session Removed');
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
