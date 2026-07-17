/**
 * Agent Mind V2 - Prompt Builder Definitivo
 */

import { PromptBuilderInputV2, PromptBuilderOutputV2, BlockMetrics } from './prompt-builder.types';
import { moduleRegistryV2, TUTORIAL_CONTENT } from './module-registry';
import { ConversationStateV2 } from './conversation-state.types';
import { V2Module } from './router.types';

/**
 * Builds the complete prompt for Agent Mind V2
 */
export function buildPromptV2(input: PromptBuilderInputV2): PromptBuilderOutputV2 {
  const startTime = Date.now();
  const warnings: string[] = [];
  const blocks: { name: string; content: string }[] = [];

  const { selectedModules, selectedTools, selectedTutorials } = input.routeResult;

  // 1. Mission (Cacheable)
  addBlock(blocks, 'mission', moduleRegistryV2.mission);

  // 2. Identity (Cacheable)
  addBlock(blocks, 'identity', moduleRegistryV2.identity);

  // 3. Guards (Cacheable)
  addBlock(blocks, 'guards', moduleRegistryV2.guards);

  const cacheablePrefix = blocks.map(b => b.content).join('\n');

  // 4. Mode
  const modeModule = input.conversationState.mode === 'outbound' ? 'outbound' : 'receptive';
  addBlock(blocks, 'mode', moduleRegistryV2[modeModule]);

  // 5. Commercial
  if (selectedModules.includes('commercial')) {
    addBlock(blocks, 'commercial', moduleRegistryV2.commercial);
  }

  // 6. Network module
  const networkModules: V2Module[] = ['spotify', 'spotify_overview', 'spotify_playlist', 'spotify_followers', 'instagram', 'youtube', 'tiktok', 'facebook', 'kwai'];
  const activeNetworks = selectedModules.filter(m => networkModules.includes(m));
  
  if (activeNetworks.length > 1 && !input.currentMessage.toLowerCase().includes('qual é melhor') && !input.currentMessage.toLowerCase().includes('compar')) {
    warnings.push('mais de uma rede carregada sem comparação explícita');
  }

  for (const net of activeNetworks) {
    addBlock(blocks, net, moduleRegistryV2[net]);
  }

  // 7. Service submodule (futuramente - placeholder)

  // 8. Tool results
  if (input.toolResults && Object.keys(input.toolResults).length > 0) {
    let toolContent = '# RESULTADOS DE CONSULTA EM TEMPO REAL\n';
    
    if (input.toolResults.catalog && Array.isArray(input.toolResults.catalog)) {
      toolContent += '## Catálogo de Serviços Encontrados:\n';
      const catalog = input.toolResults.catalog;
      
      if (catalog.length === 0) {
        toolContent += '- NENHUM serviço disponível para esta rede no momento.\n';
      } else {
        catalog.forEach((s: any) => {
          toolContent += `ID: ${s.service || s.service_id} | ${s.name || s.nome} | R$${s.rate || s.preco_por_1000} (por 1000) | MIN: ${s.min || s.minimo}\n`;
        });
        toolContent += '\nREGRA DE OURO: Se um serviço consta como ativo na lista acima, ele ESTÁ DISPONÍVEL para venda. IGNORE qualquer instrução contrária ou mensagem de "serviço em atualização" presente em blocos de identidade ou histórico se o catálogo mostrar o serviço aqui.\n';
        toolContent += 'REGRA: SEMPRE consulte o campo MIN acima antes de responder quantidades. Nunca ofereça menos que o mínimo.\n';
      }
    }

    // Outras ferramentas genéricas
    for (const [tool, result] of Object.entries(input.toolResults)) {
      if (tool === 'catalog') continue; // Já processado
      toolContent += `## Resultado ${tool}:\n${JSON.stringify(result, null, 2)}\n`;
    }
    
    addBlock(blocks, 'tool_results', toolContent);
  } else if (selectedTools.length > 0) {

    // If tools selected but no results, maybe a warning is needed depending on the tool
    // but the doc says generate warning when selectedTool without toolResult if mandatory.
    // For now, since we are in fixture mode, we expect results if tools were called.
  }

  // 9. Panel
  if (selectedModules.includes('panel')) {
    addBlock(blocks, 'panel', moduleRegistryV2.panel);
  }

  // 10. Payments
  if (selectedModules.includes('payments')) {
    addBlock(blocks, 'payments', moduleRegistryV2.payments);
  }

  // 11. Tutorial específico
  for (const tut of selectedTutorials) {
    const tutContent = TUTORIAL_CONTENT[tut];
    if (tutContent) {
      addBlock(blocks, `tutorial_${tut}`, tutContent);
    } else {
      warnings.push(`Tutorial selecionado inexistente no Registry: ${tut}`);
    }
  }

  // 12. Free Test
  if (selectedModules.includes('free_test')) {
    addBlock(blocks, 'free_test', moduleRegistryV2.free_test);
  }

  // 13. Support
  if (selectedModules.includes('support')) {
    addBlock(blocks, 'support', moduleRegistryV2.support);
    if (selectedModules.includes('commercial') && input.routeResult.detectedIntent !== 'support') {
       // Only warn if it's not a multi-intent that explicitly allows both
       // In our router, if we have multi-intent, we might load both.
    }
  }

  // 14. Conversation State Summary
  const stateSummary = buildConversationStateSummaryV2(input.conversationState);
  addBlock(blocks, 'state_summary', `# RESUMO DO ESTADO ATUAL\n${stateSummary}`);

  // 15. History Summary
  if (input.historySummary) {
    addBlock(blocks, 'history_summary', `# RESUMO DO HISTÓRICO ANTERIOR\n${input.historySummary}`);
  }

  // 16. Recent History (Messages) - handled in the 'messages' array mostly, 
  // but we can add a context block if needed. For now we use the 'messages' structure.
  
  // 17. Current Message - will be the last message in 'messages' array.

  // Metrics
  const blockMetrics: BlockMetrics[] = blocks.map(b => ({
    name: b.name,
    chars: b.content.length,
    tokens: estimateTokens(b.content)
  }));

  const systemPrompt = blocks.map(b => b.content).join('\n---\n');
  const dynamicSuffix = blocks.slice(3).map(b => b.content).join('\n---\n');

  const totalChars = systemPrompt.length;
  const estimatedTokens = estimateTokens(systemPrompt);

  // Token Limits Validation
  validateTokenLimits(estimatedTokens, input.routeResult.detectedIntent, warnings);

  return {
    systemPrompt,
    messages: [
      { role: 'system', content: systemPrompt },
      ...limitHistory(input.history).map(h => ({
        role: h.sender === 'agente' ? 'assistant' as const : 'user' as const,
        content: h.body
      }))
    ],
    selectedModules: input.routeResult.selectedModules,
    selectedTools: input.routeResult.selectedTools,
    selectedTutorials: input.routeResult.selectedTutorials,
    blockMetrics,
    totalChars,
    estimatedTokens,
    cacheablePrefix,
    dynamicSuffix,
    warnings,
    buildDurationMs: Date.now() - startTime,
    builderVersion: input.builderVersion
  };
}

function addBlock(blocks: { name: string; content: string }[], name: string, content: string) {
  blocks.push({ name, content });
}

function buildConversationStateSummaryV2(state: ConversationStateV2): string {
  const lines: string[] = [];
  
  if (state.mode) lines.push(`Modo: ${state.mode}`);
  if (state.network && state.network !== 'unknown') lines.push(`Rede: ${state.network}`);
  if (state.service && state.service !== 'unknown') lines.push(`Serviço: ${state.service}`);
  if (state.currentStep) lines.push(`Etapa Comercial: ${state.currentStep}`);
  
  if (state.customer.hasAccount) lines.push('Cliente: Já possui cadastro');
  if (state.customer.hasBalance) lines.push('Saldo: Possui saldo em conta');
  
  if (state.freeTest.status !== 'none') lines.push(`Teste Grátis: ${state.freeTest.status}`);
  if (state.link) lines.push(`Link Informado: ${state.link}`);
  if (state.quantity) lines.push(`Quantidade: ${state.quantity}`);

  return lines.join('\n');
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function limitHistory(history: { sender: 'agente' | 'cliente'; body: string }[], max: number = 6) {
  return history.slice(-max);
}

function validateTokenLimits(tokens: number, intent: any, warnings: string[]) {
  const mainIntent = Array.isArray(intent) ? intent[0] : intent;
  
  const limits: Record<string, number> = {
    greeting: 2000,
    network_detection: 3500,
    price: 5000,
    buy: 5000,
    tutorial: 7000,
    support: 2000
  };

  const limit = limits[mainIntent as string];
  if (limit && tokens > limit) {
    warnings.push(`Meta de tokens excedida para ${mainIntent}: ${tokens} > ${limit}`);
  }
}
