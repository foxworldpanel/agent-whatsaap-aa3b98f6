/**
 * Agent Mind V2 - E2E Audit Report Generator
 */

import fs from 'fs';
import { runAgentV2Turn } from './orchestrator.ts';
import { ConversationStateV2, V2Network } from './conversation-state.types.ts';
import { AgentV2E2EInput } from './orchestrator.types.ts';

const INITIAL_STATE: ConversationStateV2 = {
  conversationId: 'audit-e2e',
  workspaceId: 'ws-audit',
  phoneNumber: '5511999999999',
  mode: 'receptive',
  network: 'unknown',
  service: 'unknown',
  intent: 'unknown',
  currentStep: 'greeting',
  customer: { hasAccount: false, hasBalance: false },
  payment: {},
  freeTest: { status: 'none' },
  tutorial: { active: false },
  support: { active: false },
  toolsUsed: [],
  loadedModules: [],
  facts: {},
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

async function runAudit() {
  const report: any[] = [];
  
  // Conversas Auditáveis
  const scenarios = [
    { 
      name: "C1 Spotify e compra", 
      turns: [
        { msg: "Quero divulgar minha música.", fix: {} },
        { msg: "Quero comprar divulgação para minha música.", fix: {} },
        { msg: "Spotify e Instagram e YouTube, quero tudo junto mas meu cartão não passa e o suporte não ajuda.", fix: {} },
        { msg: "Spotify.", fix: {} },
        { msg: "Playlist.", fix: {} },
        { msg: "Quanto custa?", fix: { consultar_servicos: { salePrice: 49.90, isActive: true } } },
        { msg: "Vamos fechar.", fix: {} },
        { msg: "Não.", fix: {} }
      ]
    },
    {
      name: "C2 teste grátis",
      turns: [
        { msg: "Tenho medo de comprar e não funcionar.", fix: {} },
        { msg: "Quero.", fix: {} },
        { msg: "https://open.spotify.com/track/123", fix: { teste_gratis: { status: 'running' } } },
        { msg: "__test_callback__ teste concluído", fix: {} }
      ]
    },
    {
      name: "C3 serviço inativo",
      turns: [
        { msg: "Quero plays no Spotify.", fix: { consultar_servicos: { salePrice: 49.90, isActive: false } } },
        { msg: "Sim.", fix: {} }
      ]
    },
    {
      name: "C4 suporte",
      turns: [{ msg: "Meu pedido caiu.", fix: {} }]
    },
    {
      name: "C5 mudança de rede",
      turns: [{ msg: "Na verdade quero YouTube.", fix: {} }]
    },
    {
      name: "C6 preço antigo",
      turns: [{ msg: "Quanto custa?", fix: { consultar_servicos: { salePrice: 49.90, isActive: true } }, history: [{ sender: 'agente', body: "Playlist custa R$ 97." }] }]
    },
    {
      name: "C7 regeneração",
      turns: [{ msg: "Quanto custa? (force_error)", fix: { consultar_servicos: { salePrice: 49.90, isActive: true } } }]
    },
    {
      name: "C8 encerramento",
      turns: [{ msg: "Obrigado.", fix: {} }]
    }
  ];

  for (const scenario of scenarios) {
    let state = { ...INITIAL_STATE, conversationId: scenario.name };
    for (const [i, turn] of scenario.turns.entries()) {
      const input = createInput(state, turn.msg, turn.fix);
      if ((turn as any).history) input.shortHistory = (turn as any).history;
      
      const result = await runAgentV2Turn(input);
      
      report.push({
        conversation: scenario.name,
        turn: i + 1,
        currentMessage: turn.msg,
        stateBefore: result.stateBefore,
        shortAnswerResolution: result.shortAnswerResolution,
        routeResult: result.routeResult,
        stateEvents: result.routeResult.stateEvents,
        stateAfterRouting: result.stateAfterRouting,
        modelRouteResult: result.modelRouteResult,
        selectedModules: result.routeResult.selectedModules,
        selectedTools: result.routeResult.selectedTools,
        toolCallCount: result.routeResult.selectedTools.length,
        toolResult: input.toolFixtures,
        promptBlockTokens: 0, // Placeholder
        totalPromptTokens: 0, // Placeholder
        selectedModel: result.modelRouteResult.selectedModel,
        routingReason: result.modelRouteResult.routingReason,
        modelResponse: result.modelResponse,
        guardViolations: result.guardResult?.violations || [],
        guardAction: result.guardResult?.blocked ? 'block' : (result.guardResult?.requiresRegeneration ? 'regenerate' : 'allow'),
        regenerationCount: result.metrics.regenerationCount,
        regeneratedResponse: result.regenerationResult?.modelResponse || null,
        finalResponse: result.finalResponse,
        stateAfter: result.stateAfter,
        inputTokens: 0, // Placeholder
        outputTokens: 0, // Placeholder
        cacheCreationInputTokens: 0, // Placeholder
        cacheReadInputTokens: 0, // Placeholder
        estimatedCost: 0, // Placeholder
        durationMs: result.metrics.durationMs,
        usedLlm: result.modelRouteResult.useLlm,
        sentToCustomer: false
      });
      state = result.stateAfter;
    }
  }

  fs.writeFileSync('/tmp/agent-v2-e2e-report.json', JSON.stringify(report, null, 2));
  console.log("Audit report generated at /tmp/agent-v2-e2e-report.json");
}

function createInput(state: ConversationStateV2, message: string, fixtures: any = {}): AgentV2E2EInput {
  return {
    workspaceId: state.workspaceId,
    conversationId: state.conversationId,
    phoneNumber: state.phoneNumber,
    currentMessage: message,
    previousState: state,
    mode: state.mode,
    shortHistory: [],
    toolFixtures: fixtures,
    executionMode: 'isolated'
  };
}

runAudit();
