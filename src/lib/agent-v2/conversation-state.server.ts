import { 
  ConversationStateV2, 
  IConversationStateRepositoryV2 
} from './conversation-state.types';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

/**
 * Persiste o estado V2 no banco de dados para que ele sobreviva entre turnos
 */
export class SupabaseConversationStateRepositoryV2 implements IConversationStateRepositoryV2 {
  async get(conversationId: string): Promise<ConversationStateV2 | null> {
    const { data, error } = await supabaseAdmin
      .from('conversations')
      .select('contexto_v2')
      .eq('id', conversationId)
      .maybeSingle();

    if (error || !data || !data.contexto_v2) return null;
    
    try {
      return data.contexto_v2 as unknown as ConversationStateV2;
    } catch (e) {
      console.error('[State V2] Failed to parse state from DB:', e);
      return null;
    }
  }

  async save(state: ConversationStateV2): Promise<void> {
    const { error } = await supabaseAdmin
      .from('conversations')
      .update({ 
        contexto_v2: state as any,
        updated_at: new Date().toISOString()
      } as any)
      .eq('id', state.conversationId);
      
    if (error) {
      console.error('[State V2] Failed to save state to DB:', error);
    }
  }

  async delete(conversationId: string): Promise<void> {
    await supabaseAdmin
      .from('conversations')
      .update({ contexto_v2: null } as any)
      .eq('id', conversationId);
  }
}

let repository: IConversationStateRepositoryV2 | null = null;

export function getConversationStateRepositoryV2(): IConversationStateRepositoryV2 {
  if (!repository) {
    repository = new SupabaseConversationStateRepositoryV2();
  }
  return repository;
}
