import { supabaseAdmin } from './src/integrations/supabase/client.server';

async function testRpc() {
  const { data, error } = await (supabaseAdmin as any).rpc('upsert_agent_v2_turn_analytics', {
      p_turn_id: 'test-turn-' + Date.now(),
      p_workspace_id: 'bd59fa41-3994-4340-9a28-660c63966085',
      p_conversation_id: 'test-conv-id',
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
      p_quality_flags: {},
      p_customer_stage: 'greeting',
      p_selected_modules: [],
      p_selected_tools: [],
      p_selected_tutorials: [],
      p_execution_mode: 'real',
      p_errors: []
  });

  if (error) {
    console.log('RPC ERROR:', JSON.stringify(error, null, 2));
  } else {
    console.log('RPC SUCCESS:', data);
  }
}

testRpc().catch(console.error);
