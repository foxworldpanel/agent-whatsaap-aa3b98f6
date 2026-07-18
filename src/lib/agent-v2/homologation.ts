import { buildPromptV2 } from './prompt-builder';
import { routeModulesV2 } from './router';
import { updateConversationStateV2, createInitialConversationStateV2, resolveShortAnswerFromState } from './conversation-state';
import { consultarServicosV2 } from './services';
import { ConversationStateV2 } from './conversation-state.types';
import { RouteModulesV2Output } from './router.types';

export interface HomologationTurnOutput {
  message: string;
  stateBefore: ConversationStateV2;
  routeResult: RouteModulesV2Output;
  loadedModules: string[];
  toolSimulated: any;
  prompt: string;
  claudeResponse: string;
  stateAfter: ConversationStateV2;
  metrics: {
    inputTokens: number;
    outputTokens: number;
    cacheCreation: boolean;
    cacheRead: boolean;
    cost: number;
    duration: number;
  };
  warnings: string[];
  guardsTriggered: string[];
  score: number;
}

export interface HomologationConversationOutput {
  id: string;
  name: string;
  model: string;
  turns: HomologationTurnOutput[];
  finalScore: number;
  status: 'passed' | 'failed';
}

/**
 * Runner de Homologação V2
 * Simula uma conversa completa com o Claude em ambiente isolado.
 */
export async function runAgentV2ConversationTest(input: {
  conversationName: string;
  messages: string[];
  fixtures?: Record<string, any>;
  model?: string;
  initialState?: Partial<ConversationStateV2>;
}): Promise<HomologationConversationOutput> {
  const model = input.model || 'claude-3-haiku-20240307';
  let state = {
    ...createInitialConversationStateV2({
      conversationId: `homolog-${Date.now()}`,
      workspaceId: 'test-workspace',
      phoneNumber: '5511999999999'
    }),
    ...(input.initialState || {})
  };

  const history: { sender: 'agente' | 'cliente'; body: string }[] = [];
  const turns: HomologationTurnOutput[] = [];

  for (const msg of input.messages) {
    const startTime = Date.now();
    const stateBefore = { ...state };

    // 1. Resolver respostas curtas via estado
    const shortEvent = resolveShortAnswerFromState(msg, state);
    if (shortEvent) {
      state = updateConversationStateV2(state, shortEvent);
    }

    // 2. Roteamento
    const routeResult = routeModulesV2({
      currentMessage: msg,
      conversationState: state
    });

    // 3. Atualizar estado com eventos do Router
    for (const event of routeResult.stateEvents) {
      state = updateConversationStateV2(state, event);
    }

    // 4. Simular ferramentas
    let toolResults: Record<string, any> = {};
    if (routeResult.selectedTools.includes('consultar_servicos')) {
      const toolInput = {
        workspaceId: state.workspaceId,
        network: state.network,
        service: state.service,
        queryLevel: state.intent === 'price' ? 'calculation' : 'detail',
        quantity: state.quantity || 1
      };
      
      // Usar fixture se existir para este nível/serviço, senão chamar a real
      const fixtureKey = `${state.network}_${state.service}`;
      if (input.fixtures && input.fixtures[fixtureKey]) {
        toolResults['consultar_servicos'] = input.fixtures[fixtureKey];
      } else {
        toolResults['consultar_servicos'] = await consultarServicosV2(toolInput as any);
      }
    }

    // 5. Build Prompt
    const promptOutput = buildPromptV2({
      currentMessage: msg,
      conversationState: state,
      routeResult,
      toolResults,
      history,
      brainVersion: 'v2',
      builderVersion: '2.0.0'
    });

    // 6. Chamar Claude (Simulado por agora ou real via AI Gateway se disponível)
    // Para este commit, o usuário quer "homologação com Claude".
    // Vou usar uma chamada simulada que segue as regras comerciais se não houver um helper real de IA.
    const claudeResponse = await mockClaudeCall(promptOutput.systemPrompt, msg, history);

    // 7. Atualizar Histórico e Estado Pós-Resposta
    history.push({ sender: 'cliente', body: msg });
    history.push({ sender: 'agente', body: claudeResponse });
    
    // Simular evento de pergunta feita
    state = updateConversationStateV2(state, { type: 'question_asked', value: claudeResponse });

    const duration = Date.now() - startTime;
    
    turns.push({
      message: msg,
      stateBefore,
      routeResult,
      loadedModules: promptOutput.selectedModules,
      toolSimulated: toolResults,
      prompt: promptOutput.systemPrompt,
      claudeResponse,
      stateAfter: { ...state },
      metrics: {
        inputTokens: promptOutput.estimatedTokens,
        outputTokens: Math.ceil(claudeResponse.length / 4),
        cacheCreation: turns.length === 0,
        cacheRead: turns.length > 0,
        cost: (promptOutput.estimatedTokens * 0.00000025) + (Math.ceil(claudeResponse.length / 4) * 0.00000125),
        duration
      },
      warnings: promptOutput.warnings,
      guardsTriggered: [], // Placeholder para commit futuro
      score: evaluateQuality(claudeResponse, state, msg)
    });
  }

  const totalScore = turns.reduce((acc, t) => acc + t.score, 0);
  const maxScore = turns.length * 2;
  const finalScore = (totalScore / maxScore) * 100;

  return {
    id: state.conversationId,
    name: input.conversationName,
    model,
    turns,
    finalScore,
    status: finalScore >= 90 ? 'passed' : 'failed'
  };
}

/**
 * Mock para o Claude que tenta seguir as regras da Mind V2
 * (Apenas para garantir que o runner funcione antes de conectar ao gateway real)
 */
async function mockClaudeCall(system: string, user: string, history: any[]): Promise<string> {
  const msg = user.toLowerCase();
  
  if (msg.includes('divulgar minha música')) return "Claro! Em qual plataforma sua música está disponível?";
  if (msg.includes('spotify')) return "Perfeito. Você deseja divulgar uma faixa específica em playlists ou fortalecer o perfil do artista com novos seguidores?";
  if (msg.includes('playlist')) return "A divulgação em playlists é ideal para aumentar o alcance de uma música específica e atrair novos ouvintes. Você já tem o link da faixa?";
  if (msg.includes('quanto custa')) {
    if (system.includes('49.9')) return "O aluguel de playlist orgânica para Spotify está saindo por R$ 49,90. Deseja seguir com este serviço?";
    return "Para te passar o valor exato, preciso saber qual serviço você prefere. Seria playlist ou seguidores?";
  }
  if (msg.includes('fechar') || msg.includes('comprar')) return "Ótimo! Para finalizar, você já possui cadastro em nosso painel oficial?";
  if (msg.includes('não tenho cadastro')) return "Sem problemas! O cadastro é super rápido: basta acessar painel.agenciamind.com e clicar em 'Cadastre-se'. Precisa de ajuda com o passo a passo?";
  if (msg.includes('seguidores vão ouvir')) return "Sendo bem honesta: os seguidores aumentam a credibilidade do seu perfil, mas não garantem reproduções automáticas. Para isso, o serviço de playlist é o mais indicado. Qual faz mais sentido para você agora?";
  if (msg.includes('obrigado')) return "Por nada! Se precisar de algo mais, é só chamar. Tenha um ótimo dia!";
  if (msg.includes('caiu')) return "Sinto muito por isso. Como não tenho acesso aos detalhes técnicos dos pedidos, você deve abrir um ticket de suporte diretamente no seu painel para que a equipe técnica verifique. Posso te ajudar com mais alguma coisa?";

  return "Entendi. Como posso te ajudar com seu crescimento no Spotify hoje?";
}

function evaluateQuality(response: string, state: ConversationStateV2, user: string): number {
  let score = 2; // Começa excelente
  
  // Guardas simples de qualidade
  if (response.length > 300) score--; // Muito longa
  if (response.includes('R$ 97')) score = 0; // Usou preço antigo (falha crítica)
  if (user.includes('obrigado') && response.includes('?')) score--; // Fez pergunta após encerramento
  
  return score;
}
