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
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(
      JSON.stringify({ content: [{ type: "text", text: "Claro, me diz em qual plataforma você quer os plays." }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
  ));
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
  
  expect(result.modules).toBeDefined();
  expect(result.modules.selected_keys.length).toBeGreaterThan(0);
  expect(result.modules.estimated_tokens_by_module).toBeDefined();
  expect(result.modules.prompt_tokens_with_commercial).toBeGreaterThanOrEqual(
    result.modules.prompt_tokens_without_commercial,
  );
  expect(result.modules.commercial_tokens_added).toBeGreaterThanOrEqual(0);
});
