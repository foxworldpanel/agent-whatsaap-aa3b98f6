import { MISSION_V2 } from './core/mission';
import { IDENTITY_V2 } from './core/identity';
import { GUARDS_V2 } from './core/guards';
import { RECEPTIVE_V2 } from './core/receptive';
import { OUTBOUND_V2 } from './core/outbound';
import { COMMERCIAL_V2 } from './core/commercial';

export interface PromptInput {
  currentMessage: string;
  history: any[];
  state: any;
  mode: 'receptive' | 'outbound';
  selectedModules: string[];
}

export interface BlockMetrics {
  name: string;
  chars: number;
  tokens: number;
}

export function buildPromptV2(input: PromptInput) {
  const blocks: { name: string; content: string }[] = [];

  // 1. Missão
  blocks.push({ name: 'mission', content: MISSION_V2 });

  // 2. Identidade
  blocks.push({ name: 'identity', content: IDENTITY_V2 });

  // 3. Guardas
  blocks.push({ name: 'guards', content: GUARDS_V2 });

  // 4. Modo
  const modeContent = input.mode === 'outbound' ? OUTBOUND_V2 : RECEPTIVE_V2;
  blocks.push({ name: 'mode', content: modeContent });

  // 5. Regras Comerciais
  blocks.push({ name: 'commercial', content: COMMERCIAL_V2 });

  // Montagem do System Prompt
  const systemPrompt = blocks.map(b => b.content).join('\n');

  // Métricas
  const blockMetrics: BlockMetrics[] = blocks.map(b => ({
    name: b.name,
    chars: b.content.length,
    tokens: Math.ceil(b.content.length / 4) // Estimativa simples
  }));

  return {
    systemPrompt,
    messages: [
      ...input.history.map(h => ({ role: h.sender === 'agente' ? 'assistant' : 'user', content: h.body })),
      { role: 'user', content: input.currentMessage }
    ],
    blockMetrics,
    totalChars: systemPrompt.length,
    estimatedTokens: Math.ceil(systemPrompt.length / 4),
    selectedModules: input.selectedModules
  };
}
