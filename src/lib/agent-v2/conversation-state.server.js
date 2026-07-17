import { supabaseAdmin } from '@/integrations/supabase/client.server';
/**
 * Persiste o estado V2 no banco de dados para que ele sobreviva entre turnos
 */
export class SupabaseConversationStateRepositoryV2 {
    async get(conversationId) {
        const { data, error } = await supabaseAdmin
            .from('conversations')
            .select('contexto_v2')
            .eq('id', conversationId)
            .maybeSingle();
        if (error || !data || !data.contexto_v2)
            return null;
        try {
            return data.contexto_v2;
        }
        catch (e) {
            console.error('[State V2] Failed to parse state from DB:', e);
            return null;
        }
    }
    async save(state) {
        const { error } = await supabaseAdmin
            .from('conversations')
            .update({
            contexto_v2: state,
            updated_at: new Date().toISOString()
        })
            .eq('id', state.conversationId);
        if (error) {
            console.error('[State V2] Failed to save state to DB:', error);
        }
    }
    async delete(conversationId) {
        await supabaseAdmin
            .from('conversations')
            .update({ contexto_v2: null })
            .eq('id', conversationId);
    }
}
let repository = null;
export function getConversationStateRepositoryV2() {
    if (!repository) {
        repository = new SupabaseConversationStateRepositoryV2();
    }
    return repository;
}
