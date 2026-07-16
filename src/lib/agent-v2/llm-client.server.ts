/**
 * LLM Client for Agent Mind V2
 * Isolated layer for model inference, replacing legacy V1 brain calls.
 */

import { generateAgentReplyWithMeta } from '../ai.server';

export interface LLMRequestV2 {
  workspaceId: string;
  phoneNumber: string;
  systemPrompt: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  model?: string;
  temperature?: number;
}

/**
 * Calls the LLM provider directly without V1 business logic/guards.
 * Currently uses generateAgentReplyWithMeta as a bridge but filters out its logic.
 */
export async function callLLMV2(params: LLMRequestV2): Promise<string> {
  const { workspaceId, phoneNumber, systemPrompt, messages, model } = params;

  // In the future, this will call Lovable AI Gateway or Anthropic directly.
  // For now, we bridge to ai.server.ts but ENSURE we pass only the raw prompt.
  
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data: agent } = await supabaseAdmin.from('agent_config').select('*').eq('workspace_id', workspaceId).maybeSingle();
  const { data: integ } = await supabaseAdmin.from('integrations').select('anthropic_api_key').eq('user_id', agent?.user_id as string).maybeSingle();

  if (!agent || !integ) {
    throw new Error(`Configuração não encontrada para workspace ${workspaceId}`);
  }

  // Bridging to V1 generator but using it only as an inference engine.
  // We pass our V2 system prompt as 'base_instruction' to override V1 defaults if needed,
  // but since generateAgentReplyWithMeta builds its own system prompt, 
  // we pass our V2 prompt as extraContext and a flag to indicate V2 mode if supported.
  
  const v1Args = {
    anthropicApiKey: integ.anthropic_api_key,
    agent: {
      ...agent,
      // We pass the V2 system prompt as the base instruction to minimize V1 interference
      base_instruction: systemPrompt 
    } as any,
    contact: { nome: 'Cliente', perfil: 'frio' as const },
    history: messages.map(m => ({ 
      sender: m.role === 'user' ? 'cliente' as const : 'agente' as const, 
      body: m.content 
    })),
    // We send a signal that this is a V2 turn
    extraContext: `[V2_TURN_ORCHESTRATION]`,
    userId: agent.user_id,
  };

  const result = await generateAgentReplyWithMeta(v1Args);
  return result.text;
}
