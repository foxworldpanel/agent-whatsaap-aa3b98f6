/**
 * Agent Mind V2 - Guard Engine
 */

import { 
  GuardEngineInput, 
  GuardEngineOutput, 
  GuardViolation, 
  GuardAction 
} from './guard-engine.types';

const SUPPORT_MINIMAL_RESPONSE = "Para analisar esse caso, abra um ticket no suporte do painel. Por lá a equipe consegue acessar os dados do pedido.";

export function runGuardEngineV2(input: GuardEngineInput): GuardEngineOutput {
  const startTime = Date.now();
  let finalResponse = input.draftResponse || "";
  const violations: GuardViolation[] = [];
  const triggeredGuards: string[] = [];
  let blocked = false;
  let blockReason: string | null = null;
  let requiresRegeneration = false;

  const runGuard = (name: string, check: () => GuardViolation | null) => {
    triggeredGuards.push(name);
    const violation = check();
    if (violation) {
      violations.push(violation);
      if (violation.action === 'block') {
        blocked = true;
        blockReason = violation.message;
      }
      if (violation.action === 'regenerate') {
        requiresRegeneration = true;
      }
    }
  };

  // 1. SYSTEM_LEAK_GUARD
  runGuard('SYSTEM_LEAK_GUARD', () => {
    const leaks = ['meu prompt', 'módulo carregado', 'ferramenta interna', 'como ia fui instruída', 'detalhes da arquitetura'];
    if (leaks.some(leak => finalResponse.toLowerCase().includes(leak))) {
      return { guard: 'SYSTEM_LEAK_GUARD', action: 'block', severity: 'critical', message: 'Vazamento de sistema detectado.' };
    }
    return null;
  });
  if (blocked) return createOutput();

  // 2. INTERNAL_DATA_GUARD
  runGuard('INTERNAL_DATA_GUARD', () => {
    const internals = ['system prompt', 'módulos internos', 'logs', 'ids internos', 'custo do fornecedor', 'margem', 'provider', 'api keys', 'chain-of-thought'];
    if (internals.some(item => finalResponse.toLowerCase().includes(item))) {
      return { guard: 'INTERNAL_DATA_GUARD', action: 'block', severity: 'critical', message: 'Exposição de dados internos.' };
    }
    return null;
  });
  if (blocked) return createOutput();

  // 3. PAYMENT_GUARD
  runGuard('PAYMENT_GUARD', () => {
    const forbidden = ['pix', 'chave', 'carteira', 'senha', 'código', 'seed phrase'];
    const msg = finalResponse.toLowerCase();
    const customerMsg = input.currentMessage.toLowerCase();
    
    if (msg.includes('pix') && (msg.includes('chave') || msg.includes('enviar') || msg.includes('fazer'))) {
      if (!msg.includes('painel')) {
         const hasIssue = customerMsg.includes('não recebi') || customerMsg.includes('caiu') || customerMsg.includes('erro') || customerMsg.includes('cobrança');
         
         if (hasIssue) {
           finalResponse = "Para analisar problemas com pagamentos, abra um ticket no suporte do painel. Por lá a equipe consegue acessar os dados da transação.";
           return { guard: 'PAYMENT_GUARD', action: 'replace_minimal', severity: 'critical', message: 'payment_support_redirect' };
         } else {
           finalResponse = "O pagamento é feito dentro do painel. Acesse a área de recarga e gere o PIX por lá.";
           return { guard: 'PAYMENT_GUARD', action: 'replace_minimal', severity: 'critical', message: 'payment_redirect' };
         }
      }
    }
    return null;
  });
  if (blocked) return createOutput();

  // 4. TOOL_TRUTH_GUARD
  runGuard('TOOL_TRUTH_GUARD', () => {
    const claims = ['consultei', 'enviei', 'aprovado', 'concluído', 'ativo', 'andamento'];
    const msg = finalResponse.toLowerCase();
    if (claims.some(claim => msg.includes(claim))) {
      const hasToolResult = Object.keys(input.toolResults).length > 0;
      if (!hasToolResult && !input.conversationState.facts?.status) {
        return { guard: 'TOOL_TRUTH_GUARD', action: 'regenerate', severity: 'critical', message: 'Afirmação sem retorno real de ferramenta.' };
      }
    }
    return null;
  });

  // 5. STATUS_GUARD
  runGuard('STATUS_GUARD', () => {
    if (finalResponse.includes('concluído') && !input.conversationState.facts?.status_official) {
       // Placeholder para verificação de status real
    }
    return null;
  });

  runGuard('PRICE_SOURCE_GUARD', () => {
    // Regex melhorada para capturar números com vírgula ou ponto (ex: 49,90 ou 49.90)
    const priceRegex = /\d+(?:[.,]\d+)?/g;
    const matches = finalResponse.match(priceRegex);
    
    if (matches) {
      const toolResult = input.toolResults['consultar_servicos'];
      
      for (const match of matches) {
        const informedPrice = parseFloat(match.replace(',', '.'));
        
        // Ignora números que não parecem preços (ex: 1, 500, etc) baseando-se no toolResult
        if (toolResult && toolResult.salePrice) {
          const actualPrice = toolResult.salePrice;
          
          // Se o número informado é próximo ao preço real, ignoramos (sucesso)
          if (Math.abs(informedPrice - actualPrice) < 0.01) continue;
          
          // Se o número informado é diferente mas o toolResult existe, é uma violação
          // (ex: informar 97 quando o real é 49.90)
          return { guard: 'PRICE_SOURCE_GUARD', action: 'regenerate', severity: 'critical', message: `Preço divergente: ${informedPrice} vs ${actualPrice}` };
        }
      }
    }
    return null;
  });


  // 7. SERVICE_AVAILABILITY_GUARD
  runGuard('SERVICE_AVAILABILITY_GUARD', () => {
    const toolResult = input.toolResults['consultar_servicos'];
    if (toolResult && toolResult.isActive === false) {
      if (finalResponse.toLowerCase().includes('disponível') || finalResponse.toLowerCase().includes('temos')) {
        return { guard: 'SERVICE_AVAILABILITY_GUARD', action: 'regenerate', severity: 'high', message: 'Serviço inativo oferecido como disponível.' };
      }
    }
    return null;
  });

  // 8. PLATFORM_FOCUS_GUARD
  runGuard('PLATFORM_FOCUS_GUARD', () => {
    const network = input.conversationState.network;
    if (network && network !== 'unknown') {
      const otherPlatforms = ['instagram', 'tiktok', 'youtube', 'facebook', 'kwai'].filter(p => p !== network);
      if (otherPlatforms.some(p => finalResponse.toLowerCase().includes(p)) && !input.currentMessage.toLowerCase().includes('compar')) {
        return { guard: 'PLATFORM_FOCUS_GUARD', action: 'regenerate', severity: 'high', message: `Menção a plataforma errada: ${network}` };
      }
    }
    return null;
  });

  // 9. SERVICE_FOCUS_GUARD
  runGuard('SERVICE_FOCUS_GUARD', () => {
    const service = input.conversationState.service;
    if (service === 'playlist' && finalResponse.toLowerCase().includes('seguidores') && !input.currentMessage.toLowerCase().includes('compar')) {
       return { guard: 'SERVICE_FOCUS_GUARD', action: 'regenerate', severity: 'high', message: 'Confusão entre playlist e seguidores.' };
    }
    return null;
  });

  // 10. SUPPORT_SCOPE_GUARD
  runGuard('SUPPORT_SCOPE_GUARD', () => {
    if (input.routeResult.detectedIntent === 'support' || input.currentMessage.toLowerCase().includes('caiu')) {
      const forbidden = ['id', 'verificar', 'vou ver', 'prazo'];
      if (forbidden.some(f => finalResponse.toLowerCase().includes(f)) || !finalResponse.includes('ticket')) {
        finalResponse = SUPPORT_MINIMAL_RESPONSE;
        return { guard: 'SUPPORT_SCOPE_GUARD', action: 'replace_minimal', severity: 'high', message: 'Suporte inadequado fora do escopo.' };
      }
    }
    return null;
  });

  // 11. PROMISE_GUARD
  runGuard('PROMISE_GUARD', () => {
    const promises = ['viralizar', 'vender', 'ativar o algoritmo', 'garante', '100% seguro', 'zero risco'];
    if (promises.some(p => finalResponse.toLowerCase().includes(p))) {
      return { guard: 'PROMISE_GUARD', action: 'regenerate', severity: 'high', message: 'Promessa proibida detectada.' };
    }
    return null;
  });

  // 12. REPEATED_QUESTION_GUARD
  runGuard('REPEATED_QUESTION_GUARD', () => {
    if (input.conversationState.network !== 'unknown' && finalResponse.toLowerCase().includes('qual rede')) {
       return { guard: 'REPEATED_QUESTION_GUARD', action: 'regenerate', severity: 'medium', message: 'Pergunta repetida sobre rede já conhecida.' };
    }
    return null;
  });

  // 13. CLOSE_FLOW_GUARD
  runGuard('CLOSE_FLOW_GUARD', () => {
    if (input.routeResult.detectedIntent === 'goodbye') {
       if (finalResponse.includes('?') || finalResponse.toLowerCase().includes('promoção')) {
         return { guard: 'CLOSE_FLOW_GUARD', action: 'sanitize', severity: 'medium', message: 'Tentativa de reabrir funil em encerramento.' };
       }
    }
    return null;
  });

  // 14. MULTIPLE_QUESTIONS_GUARD
  runGuard('MULTIPLE_QUESTIONS_GUARD', () => {
    const questionCount = (finalResponse.match(/\?/g) || []).length;
    if (questionCount > 1) {
      return { guard: 'MULTIPLE_QUESTIONS_GUARD', action: 'regenerate', severity: 'medium', message: 'Múltiplas perguntas na mesma resposta.' };
    }
    return null;
  });

  // 15. DUPLICATION_GUARD
  runGuard('DUPLICATION_GUARD', () => {
    // Simplificado
    return null;
  });

  // 16. LENGTH_GUARD
  runGuard('LENGTH_GUARD', () => {
    const len = finalResponse.length;
    if (input.routeResult.detectedIntent === 'greeting' && len > 250) {
      return { guard: 'LENGTH_GUARD', action: 'regenerate', severity: 'medium', message: 'Saudação muito longa.' };
    }
    return null;
  });

  // 17. EMOJI_GUARD
  runGuard('EMOJI_GUARD', () => {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]/gu;
    const matches = finalResponse.match(emojiRegex);
    if (matches && matches.length > 1) {
       finalResponse = finalResponse.replace(emojiRegex, (match, index) => index === finalResponse.search(emojiRegex) ? match : '');
       return { guard: 'EMOJI_GUARD', action: 'sanitize', severity: 'low', message: 'Excesso de emojis removido.' };
    }
    return null;
  });

  function createOutput(): GuardEngineOutput {
    const violationCount = violations.length;
    const correctionCount = violations.filter(v => v.action === 'sanitize' || v.action === 'replace_minimal').length;
    
    return {
      approved: !blocked && !requiresRegeneration && violationCount === 0,
      finalResponse,
      violations,
      corrections: violations.filter(v => v.action === 'sanitize' || v.action === 'replace_minimal').map(v => v.message),
      triggeredGuards,
      blocked,
      blockReason,
      requiresRegeneration,
      regenerationInstruction: requiresRegeneration ? buildGuardCorrectionInstructionV2(violations) : null,
      metrics: {
        guardCount: 17,
        triggeredGuards: triggeredGuards.length,
        violationCount,
        correctionCount,
        blocked,
        requiresRegeneration,
        responseCharsBefore: input.draftResponse.length,
        responseCharsAfter: finalResponse.length,
        guardDurationMs: Date.now() - startTime
      }
    };
  }

  return createOutput();
}

function buildGuardCorrectionInstructionV2(violations: GuardViolation[]): string {
  return "CORRIJA A RESPOSTA ANTERIOR: " + violations.map(v => v.message).join("; ");
}
