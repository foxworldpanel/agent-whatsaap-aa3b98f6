import { test, expect } from 'vitest';
import { runAgentV3Turn } from '../src/lib/agent-v3/orchestrator.server';

test('Orchestrator should include telemetry and comparison', async () => {
  const message = "quero comprar plays";
  const result = await runAgentV3Turn(message, 'test-user', 'test-msg-id');
  
  expect(result.modulesTelemetry).toBeDefined();
  expect(result.modulesTelemetry?.length).toBeGreaterThan(0);
  expect(result.promptComparison).toBeDefined();
  expect(result.promptComparison?.withCommercial).toBeGreaterThan(result.promptComparison?.withoutCommercial || 0);
  
  console.log('Telemetry verified:', JSON.stringify(result.modulesTelemetry?.[0]));
  console.log('Comparison verified:', JSON.stringify(result.promptComparison));
});
