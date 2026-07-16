import { describe, it, expect } from 'vitest';
import { generateV2TestReply } from '@/lib/agent-v2/test-runner';

describe('Cenários Obrigatórios Agente V2 - Commit 3', () => {
  
  it('Cenário A: Saudação - "Boa tarde"', async () => {
    const result = await generateV2TestReply("Boa tarde");
    
    expect(result.state.intent).toBe('greeting');
    expect(result.promptData.estimatedTokens).toBeLessThan(2000);
    expect(result.promptData.selectedModules).toHaveLength(0);
    expect(result.promptData.systemPrompt).toContain('# MISSÃO');
    expect(result.promptData.systemPrompt).toContain('# MODO RECEPTIVO');
  });

  it('Cenário B: Pergunta Geral - "Vocês trabalham com o quê?"', async () => {
    const result = await generateV2TestReply("Vocês trabalham com o quê?");
    
    expect(result.state.intent).toBe('general_question');
    expect(result.promptData.estimatedTokens).toBeLessThan(2500);
    expect(result.response.length).toBeLessThan(500); // Resposta curta
  });

  it('Cenário C: Detecção de Rede - "Spotify"', async () => {
    const result = await generateV2TestReply("Spotify");
    
    expect(result.state.network).toBe('spotify');
    expect(result.promptData.selectedModules).toContain('spotify');
    expect(result.promptData.estimatedTokens).toBeLessThan(3000);
  });

  it('Cenário D: Redirecionamento Suporte - "Meu pedido caiu"', async () => {
    const result = await generateV2TestReply("Meu pedido caiu");
    
    expect(result.state.intent).toBe('support_redirect');
    expect(result.response.toLowerCase()).toContain('ticket');
    expect(result.response.toLowerCase()).toContain('suporte');
    expect(result.promptData.estimatedTokens).toBeLessThan(2000);
  });

  it('Cenário E: Encerramento - "Obrigado"', async () => {
    const result = await generateV2TestReply("Obrigado");
    
    expect(result.state.intent).toBe('close');
    expect(result.promptData.estimatedTokens).toBeLessThan(2000);
  });

  it('Validação de Métricas por Bloco', async () => {
    const result = await generateV2TestReply("Teste");
    const metrics = result.promptData.blockMetrics;
    
    expect(metrics.find(m => m.name === 'mission')).toBeDefined();
    expect(metrics.find(m => m.name === 'identity')).toBeDefined();
    expect(metrics.find(m => m.name === 'guards')).toBeDefined();
    
    metrics.forEach(m => {
      expect(m.tokens).toBeGreaterThan(0);
      expect(m.chars).toBeGreaterThan(0);
    });
  });
});
