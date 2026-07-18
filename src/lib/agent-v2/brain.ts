/**
 * Agent Mind V2 - Cérebro (Brain)
 * Ponto de entrada para a nova arquitetura.
 */

import { IAgentBrainV2 } from './interfaces';
import { ExecutionMode, BrainVersion } from './types';

export class AgentBrainV2 implements IAgentBrainV2 {
  private version: BrainVersion = 'v2';
  private mode: ExecutionMode = 'shadow';

  async process(message: string, conversationId: string) {
    // Implementação inicial: sem chamar Claude, sem alterar V1.
    // Apenas estrutura para o Shadow Mode.
    
    return {
      response: "[V2 Shadow Mode Active - No output yet]",
      metrics: {
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        duration_ms: 0,
        model: "shadow-stub"
      },
      state: {
        version: this.version,
        mode: this.mode,
        context: {
          stage: 'initialization'
        }
      }
    };
  }
}
