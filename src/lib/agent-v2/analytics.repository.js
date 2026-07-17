/**
 * InMemory Repository for Unit Testing
 */
export class InMemoryAgentV2AnalyticsRepository {
    turns = [];
    conversations = [];
    async persistTurn(data) {
        const idx = this.turns.findIndex(t => t.workspaceId === data.workspaceId &&
            t.conversationId === data.conversationId &&
            t.turnId === data.turnId);
        if (idx === -1) {
            this.turns.push({ ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        }
        else {
            const existing = this.turns[idx];
            this.turns[idx] = {
                ...existing,
                ...data,
                regenerationCount: Math.max(existing.regenerationCount, data.regenerationCount),
                toolCallCount: Math.max(existing.toolCallCount, data.toolCallCount),
                toolSuccessCount: Math.max(existing.toolSuccessCount, data.toolSuccessCount),
                toolFailureCount: Math.max(existing.toolFailureCount, data.toolFailureCount),
                sentToCustomer: existing.sentToCustomer || data.sentToCustomer,
                blocked: existing.blocked || data.blocked,
                updatedAt: new Date().toISOString()
            };
        }
    }
    async getConversationTurns(workspaceId, conversationId) {
        return this.turns.filter(t => t.workspaceId === workspaceId && t.conversationId === conversationId);
    }
    async persistConversation(data) {
        const idx = this.conversations.findIndex(c => c.workspaceId === data.workspaceId &&
            c.conversationId === data.conversationId);
        if (idx === -1) {
            this.conversations.push(data);
        }
        else {
            this.conversations[idx] = data;
        }
    }
}
/**
 * Supabase Repository for Homologation and Production
 */
export class SupabaseAgentV2AnalyticsRepository {
    async persistTurn(data) {
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        // Using the RPC for idempotent upsert with correct mapping to parameters
        const { error } = await supabaseAdmin.rpc('upsert_agent_v2_turn_analytics', {
            p_turn_id: data.turnId,
            p_workspace_id: data.workspaceId,
            p_conversation_id: data.conversationId,
            p_phone_hash: data.phoneHash,
            p_intent: data.intent,
            p_network: data.network,
            p_service: data.service,
            p_selected_model: data.selectedModel,
            p_input_tokens: data.inputTokens,
            p_output_tokens: data.outputTokens,
            p_estimated_cost: data.estimatedCost,
            p_duration_ms: data.durationMs,
            p_routing_reason: data.routingReason,
            p_quality_flags: data.qualityFlags || {},
            p_customer_stage: data.customerStage,
            p_selected_modules: data.selectedModules || [],
            p_selected_tools: data.selectedTools || [],
            p_selected_tutorials: data.selectedTutorials || [],
            p_execution_mode: data.executionMode,
            p_errors: [] // placeholder for now
        });
        if (error) {
            console.error('[SupabaseAnalytics] Failed to persist turn:', error);
            // We don't throw here to avoid breaking the user turn if analytics fails
            // throw error;
        }
    }
    async getConversationTurns(workspaceId, conversationId) {
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        const { data, error } = await supabaseAdmin
            .from('agent_v2_turn_analytics')
            .select('*')
            .eq('workspace_id', workspaceId)
            .eq('conversation_id', conversationId);
        if (error)
            throw error;
        return data;
    }
    async persistConversation(data) {
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        const { error } = await supabaseAdmin
            .from('agent_v2_conversation_analytics')
            .upsert(data, { onConflict: 'workspace_id,conversation_id' });
        if (error)
            throw error;
    }
}
/**
 * Noop Repository for Fail-Safe / Disabled Analytics
 */
export class NoopAgentV2AnalyticsRepository {
    async persistTurn() { }
    async getConversationTurns() { return []; }
    async persistConversation() { }
}
/**
 * Factory to get the active repository based on environment configuration
 */
export function getAgentV2AnalyticsRepository() {
    const mode = process.env.ANALYTICS_MODE || 'supabase';
    if (mode === 'memory')
        return new InMemoryAgentV2AnalyticsRepository();
    if (mode === 'supabase')
        return new SupabaseAgentV2AnalyticsRepository();
    return new NoopAgentV2AnalyticsRepository();
}
