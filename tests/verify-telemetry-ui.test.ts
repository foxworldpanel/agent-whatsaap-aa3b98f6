import { test, expect } from 'vitest';
import { runAgentV3Turn } from '../src/lib/agent-v3/orchestrator.server';

test('Orchestrator should include telemetry and comparison', async () => {
  const message = "quero comprar plays";
  const result = await runAgentV3Turn({
    message,
    userId: 'f8da521a-e8db-4efe-8c9b-9bd69749c0a7',
    history: [],
    inputKind: 'texto',
    messageId: 'test-msg-id',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY
  });
  
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
