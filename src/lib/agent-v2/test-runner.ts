import { buildPromptV2 } from './prompt-builder';
import { routeIntent, detectNetwork } from './router';
import { saveAgentV2Log } from './persistence';

export async function generateV2TestReply(message: string, history: any[] = []) {
  const intent = routeIntent(message);
  const network = detectNetwork(message);
  
  // Estado isolado (não persiste no DB real ainda)
  const state = {
    intent,
    network,
    mode: 'receptive',
    stage: 'initial'
  };

  const promptData = buildPromptV2({
    currentMessage: message,
    history,
    state,
    mode: 'receptive',
    selectedModules: network ? [network] : []
  });

  // Simulando resposta do modelo para o teste isolado
  // Em um cenário real de "manual test", aqui chamaria o Claude.
  const mockResponse = intent === 'greeting' ? "Olá! Sou a Júlia. Como posso ajudar você a crescer suas redes sociais hoje?" :
                       intent === 'support_redirect' ? "Entendo. Para problemas com pedidos, o ideal é abrir um ticket direto no menu 'Suporte' do seu painel. Eles resolvem rapidinho por lá!" :
                       "Entendi sua mensagem. Qual rede social você gostaria de impulsionar hoje?";

  const logData: any = {
    received_message: message,
    structured_state: state,
    mode: 'shadow' as any,
    brain_version: 'v2' as any,
    network: network || undefined,
    intent: intent,
    selected_modules: promptData.selectedModules,
    selected_tools: [],
    final_prompt: promptData.systemPrompt,
    v2_response: mockResponse,
    input_tokens: promptData.estimatedTokens,
    output_tokens: Math.ceil(mockResponse.length / 4),
    total_tokens: promptData.estimatedTokens + Math.ceil(mockResponse.length / 4),
    estimated_cost: 0,
    model: 'isolated-test-stub',
    duration_ms: 100,
    sent_to_customer: false
  };

  // Simulação de persistência (usando a função do Commit 2)
  // await saveAgentV2Log('workspace-test-id', logData);

  return {
    response: mockResponse,
    promptData,
    state
  };
}
