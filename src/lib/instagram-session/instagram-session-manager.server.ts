
import { supabase } from '@/integrations/supabase/client';
import { InstagramSessionInfo, InstagramSessionStatus } from './types';
import { InstagramWorkerClient } from '../instagram-worker/instagram-worker.client';

const logger = (event: string, details?: any) => {
  console.log(`[SessionManager] [${new Date().toISOString()}] ${event}`, details || '');
};

export class InstagramSessionManager {
  private static workerClient = new InstagramWorkerClient();

  static async connect(credentialId?: string): Promise<InstagramSessionInfo | null> {
    logger('Connect Requested', { credentialId });
    
    try {
      const response = await this.workerClient.connect(credentialId);
      
      if (response.success && response.status) {
        if (credentialId) {
          await this.updateStatus(credentialId, response.status as InstagramSessionStatus);
        }
      }
      
      return null; 
    } catch (error: any) {
      logger('Connect Error', error.message);
      throw error;
    }
  }

  static async disconnect(credentialId: string): Promise<void> {
    logger('Disconnect Started', { credentialId });
    try {
      await this.workerClient.disconnect(credentialId);
      await this.updateStatus(credentialId, 'DISCONNECTED');
    } catch (error: any) {
      logger('Disconnect Error', error.message);
      throw error;
    }
  }

  static async reconnect(credentialId: string): Promise<InstagramSessionInfo | null> {
    logger('Reconnect Requested', { credentialId });
    return await this.connect(credentialId);
  }

  static async validate(credentialId: string): Promise<InstagramSessionStatus> {
    logger('Validation Requested', { credentialId });
    try {
      const response = await this.workerClient.validate(credentialId);
      await this.updateStatus(credentialId, response.status);
      return response.status;
    } catch (error: any) {
      logger('Validation Error', error.message);
      throw error;
    }
  }

  static async getStatus(credentialId: string): Promise<InstagramSessionStatus> {
    logger('Status Requested', { credentialId });
    try {
      const response = await this.workerClient.status(credentialId);
      await this.updateStatus(credentialId, response.status);
      return response.status;
    } catch (error: any) {
      logger('Status Error', error.message);
      throw error;
    }
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
      .update({ 
        status, 
        updated_at: new Date().toISOString() 
      })
      .eq('id', credentialId);
  }
}

