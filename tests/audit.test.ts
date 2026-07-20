import { describe, it, expect, vi } from 'vitest';
import { runAgentV3Turn } from '../src/lib/agent-v3/orchestrator.server';
import { selectRelevantModules } from '../src/lib/agent-v3/module-selector.server';

// Mock simple versions of external deps if needed, but we want to test the logic
// We'll mock callAnthropicV3 to avoid real API calls and capture prompts

vi.mock('../src/lib/agent-v3/llm-client.server', () => ({
  callAnthropicV3: vi.fn(async (params) => {
    // Return a structured response that metadata-extractor can parse
    let responseText = "[TEMP:quente] [INTENT:vendas] [STAGE:lead] ";
    
    if (params.messages[params.messages.length - 1].content.toLowerCase().includes("bom dia")) {
      responseText += "Olá! Como posso te ajudar hoje?";
    } else if (params.messages[params.messages.length - 1].content.toLowerCase().includes("plays")) {
      responseText += "Temos plays para Spotify! Quantas você precisa?";
    } else if (params.messages[params.messages.length - 1].content.toLowerCase().includes("quanto custa")) {
      responseText += "1000 plays saem por apenas R$ 4,90.";
    } else if (params.messages[params.messages.length - 1].content.toLowerCase().includes("manda")) {
      responseText += "Perfeito! Só acessar mindsmmpanel.com.";
    } else {
      responseText += "Tudo certo!";
    }

    return {
      content: [{ text: responseText }],
      usage: { input_tokens: 1200, output_tokens: 50, total_tokens: 1250 }
    };
  })
}));

describe('Auditoria V3 - Carregamento Progressivo', () => {
  const userId = 'f8da521a-9694-4363-9524-780c804f3316'; // Mind Workspace
  const authNumber = '5511970116430';

  it('Turno 1: Bom dia', async () => {
    const result = await runAgentV3Turn({
      userId,
      message: 'Bom dia',
      history: [],
      anthropicApiKey: 'fake-key'
    });
    
    console.log('--- TURNO 1 RESULT ---');
    console.log(JSON.stringify({
      turn: 1,
      message: 'Bom dia',
      selectedKeys: (result as any).rawPrompt[0].text.includes('identidade') ? ['identidade', 'regras_gerais', 'comportamento_humano'] : [], // Simplificado para o log
      system_prompt_chars: (result as any).rawPrompt[0].text.length,
      usage: result.usage
    }, null, 2));
  });

  it('Turno 3: Plays (Spotify Detection)', () => {
    const modules = selectRelevantModules('Plays', ['spotify', 'instagram', 'youtube']);
    console.log('--- TURNO 3 MODULES ---');
    console.log(JSON.stringify({
      message: 'Plays',
      selectedKeys: modules
    }, null, 2));
    expect(modules).toContain('spotify');
    expect(modules).not.toContain('instagram');
  });

  it('Suporte: Meu pedido está atrasado', () => {
    const modules = selectRelevantModules('Meu pedido está atrasado', ['spotify', 'fluxo_vendas', 'suporte']);
    console.log('--- SUPORTE TEST ---');
    console.log(JSON.stringify({
      message: 'Meu pedido está atrasado',
      selectedKeys: modules
    }, null, 2));
    expect(modules).toContain('suporte');
    expect(modules).not.toContain('fluxo_vendas');
  });
});
