
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { InstagramSessionInfo, InstagramSessionStatus } from './types';
import { InstagramWorkerClient } from '../instagram-worker/instagram-worker';

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

          // Bug real encontrado em 20/08/2026: essa função sempre
          // retornava null aqui, mesmo em conexão bem-sucedida — a tela
          // sempre mostrava "Conexão cancelada ou falhou." pro usuário,
          // mesmo quando o login no popup funcionava de verdade. Busca
          // o registro atualizado pra retornar o dado real.
          const { data: updated } = await supabaseAdmin
            .from('lead_finder_credentials')
            .select('*')
            .eq('id', credentialId)
            .maybeSingle();
          if (updated) {
            // Bug real encontrado em 21/08/2026: ao corrigir o retorno
            // acima, a URL de VNC (necessária pra tela mostrar o link de
            // login) parou de chegar até o frontend — só o registro do
            // banco era retornado, sem a url. Sem isso, o card de
            // "Conectando..." aparecia sem nenhum jeito de logar.
            return { ...(updated as unknown as InstagramSessionInfo), url: response.url };
          }
        }
        // Fallback: se o worker retornou username diretamente na resposta
        // (não declarado no tipo InstagramWorkerApi, mas pode existir em
        // tempo de execução).
        const responseWithUsername = response as unknown as { username?: string };
        if (responseWithUsername.username) {
          return {
            id: credentialId || '',
            username: responseWithUsername.username,
            status: response.status as InstagramSessionStatus,
          };
        }
      }
      
      return null; 
      // Em 21/08/2026: removemos o "throw error" se não vier status, 
      // pois o worker pode estar em processo de abertura de navegador.
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

  static async getStatus(credentialId: string): Promise<{ status: InstagramSessionStatus; username: string | null }> {
    logger('Status Requested', { credentialId });
    try {
      const response = await this.workerClient.status(credentialId);
      const responseWithUsername = response as unknown as { status: InstagramSessionStatus; username?: string };

      if (responseWithUsername.status === 'CONNECTED' && responseWithUsername.username) {
        // Login concluído — salva o username real, não mais o placeholder
        // usado na criação do registro.
        await supabaseAdmin
          .from('lead_finder_credentials')
          .update({
            status: responseWithUsername.status,
            username: responseWithUsername.username,
            account_name: responseWithUsername.username,
            updated_at: new Date().toISOString(),
          })
          .eq('id', credentialId);
      } else {
        await this.updateStatus(credentialId, response.status);
      }

      return { status: response.status, username: responseWithUsername.username || null };
    } catch (error: any) {
      logger('Status Error', error.message);
      throw error;
    }
  }

  static async remove(credentialId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('lead_finder_credentials')
      .delete()
      .eq('id', credentialId);
    if (error) throw error;
  }

  static async listSessions(): Promise<InstagramSessionInfo[]> {
    const { data, error } = await supabaseAdmin
      .from('lead_finder_credentials')
      .select('*')
      .eq('platform', 'instagram');
    if (error) throw error;
    return data as unknown as InstagramSessionInfo[];
  }

  private static async updateStatus(credentialId: string, status: InstagramSessionStatus) {
    await supabaseAdmin
      .from('lead_finder_credentials')
      .update({ 
        status, 
        updated_at: new Date().toISOString() 
      })
      .eq('id', credentialId);
  }
}
