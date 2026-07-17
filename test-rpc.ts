import { supabaseAdmin } from './src/integrations/supabase/client.server';

async function test() {
  const MIND_ID = 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa';
  
  // Get real contact and conversation to avoid UUID error
  const { data: convs } = await supabaseAdmin.from('conversations').select('id, contact_id').limit(1);
  if (!convs || convs.length === 0) {
    console.log('No conversations found to test with.');
    return;
  }
  
  const conversationId = convs[0].id;
  const turnId = 'test-turn-' + Date.now();
  
  console.log('Testing RPC with real IDs:', { workspaceId: MIND_ID, conversationId });
  
  const { error } = await supabaseAdmin.rpc('upsert_agent_v2_turn_analytics', {
    p_turn_id: turnId,
    p_workspace_id: MIND_ID,
    p_conversation_id: conversationId,
    p_phone_hash: 'test-hash',
    p_intent: 'test-intent',
    p_network: 'test-network',
    p_service: 'test-service',
    p_selected_model: 'claude-haiku-4-5-20251001',
    p_input_tokens: 10,
    p_output_tokens: 20,
    p_estimated_cost: 0.0001,
    p_duration_ms: 500,
    p_routing_reason: 'test',
    p_quality_flags: { correctPrice: true, passedGuards: true },
    p_customer_stage: 'greeting',
    p_selected_modules: [],
    p_selected_tools: [],
    p_selected_tutorials: [],
    p_execution_mode: 'real',
    p_errors: []
  });

  if (error) {
    console.error('RPC ERROR:', JSON.stringify(error, null, 2));
  } else {
    console.log('RPC SUCCESS - Analytics record created/updated');
  }
}

test();
