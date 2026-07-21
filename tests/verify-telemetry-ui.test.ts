import { test, expect } from 'vitest';
import { runAgentV3Turn } from '../src/lib/agent-v3/orchestrator.server';

test('Orchestrator should include telemetry and comparison', async () => {
  const message = "quero comprar plays";
  // Mocking minimal requirements if needed, but runAgentV3Turn handles defaults
  const result = await runAgentV3Turn(message, 'test-user', 'test-msg-id');
  
  expect(result.modulesTelemetry).toBeDefined();
  expect(result.modulesTelemetry?.length).toBeGreaterThan(0);
  expect(result.promptComparison).toBeDefined();
  
  console.log('Telemetry keys:', result.modulesTelemetry?.map(t => t.key));
  console.log('Comparison:', JSON.stringify(result.promptComparison));
  
  const hasCommercial = result.modulesTelemetry?.some(t => 
    ["psicologia_vendas", "qualificacao_lead", "fluxo_vendas"].includes(t.key)
  );
  console.log('Has commercial modules:', hasCommercial);
});
