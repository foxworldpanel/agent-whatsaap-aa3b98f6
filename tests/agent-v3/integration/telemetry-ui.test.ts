import { test, expect, vi } from 'vitest';
import { runAgentV3Turn } from '@/lib/agent-v3/orchestrator.server';
import { DEFAULT_MODULES } from "@/lib/agent-modules";
vi.mock("@/lib/agent-v3/brain/modules.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agent-v3/brain/modules.server")>();
  return {
    ...actual,
    loadEnabledModulesV3: vi.fn(async () => ({})),
  };
});


test('Orchestrator should include telemetry and comparison', async () => {
  const message = "quero comprar plays";
  const result = await runAgentV3Turn({
    message,
    userId: 'f8da521a-e8db-4efe-8c9b-9bd69749c0a7',
    workspaceId: 'test-workspace',
    history: [],
    inputKind: 'texto',
    messageId: 'test-msg-id',
    anthropicApiKey: 'test-key',
    customModules: DEFAULT_MODULES,
    enabledModules: Object.keys(DEFAULT_MODULES)
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
