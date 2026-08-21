
import { InstagramSessionInfo, InstagramSessionStatus } from '../instagram-session/types';

export interface InstagramWorkerApi {
  connect(credentialId?: string): Promise<{ success: boolean; url?: string; status?: string; message?: string }>;
  disconnect(credentialId: string): Promise<{ success: boolean; message?: string }>;
  validate(credentialId: string): Promise<{ status: InstagramSessionStatus; message?: string }>;
  status(credentialId: string): Promise<{ status: InstagramSessionStatus; lastUpdated: string }>;
}

export class InstagramWorkerClient implements InstagramWorkerApi {
  private baseUrl: string;

  constructor() {
    // Read from process.env inside handler/constructor to ensure it's available in the worker runtime
    this.baseUrl = process.env.INSTAGRAM_WORKER_URL || '';
    
    if (this.baseUrl) {
      this.baseUrl = this.baseUrl.replace(/\/$/, '');
    }
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    if (!this.baseUrl) {
      console.error('[InstagramWorkerClient] INSTAGRAM_WORKER_URL not configured');
      throw new Error('Worker indisponível. Configure INSTAGRAM_WORKER_URL.');
    }

    const url = `${this.baseUrl}${path}`;
    console.log(`[InstagramWorkerClient] Request: ${options.method || 'GET'} ${url}`, options.body || '');

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          // Token de autenticação do worker — sem isso, o servidor na
          // VPS recusa toda requisição com 401 (proteção adicionada em
          // 21/08/2026, junto com a implantação do worker real).
          'x-worker-token': process.env.INSTAGRAM_WORKER_TOKEN || '',
          ...options.headers,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[InstagramWorkerClient] Error Response (${response.status}):`, errorText);
        
        if (response.status === 404) throw new Error('Endpoint do Worker não encontrado (404).');
        if (response.status === 401) throw new Error('Não autorizado (401).');
        if (response.status === 408) throw new Error('Timeout do Worker (408).');
        if (response.status >= 500) throw new Error(`Erro interno do Worker (${response.status}).`);
        
        throw new Error(`Worker retornou erro ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log(`[InstagramWorkerClient] Response:`, data);
      return data as T;
    } catch (error: any) {
      if (error.name === 'AbortError') throw new Error('Request Timeout.');
      if (error.message.includes('fetch')) throw new Error('Network Error: Não foi possível conectar ao Worker.');
      throw error;
    }
  }

  async connect(credentialId?: string) {
    return this.request<{ success: boolean; url?: string; status?: string; message?: string }>('/api/instagram/connect', {
      method: 'POST',
      body: JSON.stringify({ credentialId }),
    });
  }

  async disconnect(credentialId: string) {
    return this.request<{ success: boolean; message?: string }>('/api/instagram/disconnect', {
      method: 'POST',
      body: JSON.stringify({ credentialId }),
    });
  }

  async validate(credentialId: string) {
    return this.request<{ status: InstagramSessionStatus; message?: string }>('/api/instagram/validate', {
      method: 'POST',
      body: JSON.stringify({ credentialId }),
    });
  }

  async status(credentialId: string) {
    return this.request<{ status: InstagramSessionStatus; lastUpdated: string }>(`/api/instagram/status/${credentialId}`, {
      method: 'GET',
    });
  }

  async discover(credentialId: string, hashtag: string, maxLeads: number) {
    return this.request<{ success: boolean; jobId?: string; status?: string; message?: string }>('/api/instagram/discover', {
      method: 'POST',
      body: JSON.stringify({ credentialId, hashtag, maxLeads }),
    });
  }

  async discoveryStatus(jobId: string) {
    return this.request<{
      success: boolean;
      status: string;
      currentStep: string;
      results: Array<{
        profile: { platform: string; username: string; url?: string; bio?: string | null };
        contacts: { phone?: string | null; email?: string | null };
        links: string[];
        metadata: { segment?: string | null };
        rawData: Record<string, any>;
      }>;
    }>(`/api/instagram/discover/${jobId}/status`, { method: 'GET' });
  }
}
