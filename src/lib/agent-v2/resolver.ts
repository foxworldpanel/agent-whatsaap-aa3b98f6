/**
 * Agent Mind V2 - Resolvedor de Versão
 */

import { BrainVersion } from './types';

interface AgentConfig {
  agent_brain_version?: string;
  pilot_phone_numbers?: string[];
  v2_shadow_phone_numbers?: string[];
}

/**
 * Resolve qual versão do cérebro deve ser utilizada para uma chamada.
 * 
 * Regras:
 * - Config ausente ou inválida -> v1
 * - v2_shadow autorizado por número -> v2_shadow (silencioso)
 * - v2_pilot autorizado por número -> v2_pilot
 */
export function resolveAgentBrainVersion(
  config: AgentConfig | null | undefined,
  phoneNumber: string | null | undefined
): BrainVersion {
  if (!config) return 'v1';

  const version = config.agent_brain_version as BrainVersion;
  
  // Normalização simples para comparação (remove caracteres não numéricos)
  const normalizedTarget = (phoneNumber || '').replace(/\D/g, '');

  // Regra Shadow: Se workspace está v1 e telefone está na lista shadow
  // Nota: v2_shadow_phone_numbers é uma configuração específica e segura
  if (Array.isArray(config.v2_shadow_phone_numbers) && normalizedTarget.length > 0) {
    const isShadowAuthorized = config.v2_shadow_phone_numbers.some(num => {
      const normalizedNum = (num || '').replace(/\D/g, '');
      return normalizedNum === normalizedTarget && normalizedNum.length > 0;
    });

    if (isShadowAuthorized) {
      return 'v2_shadow';
    }
  }

  // Se não for uma das versões reconhecidas, fallback para v1
  if (!['v1', 'v2_shadow', 'v2_pilot', 'v2'].includes(version)) {
    return 'v1';
  }

  if (version === 'v2_pilot') {
    if (!normalizedTarget || !Array.isArray(config.pilot_phone_numbers)) {
      return 'v1';
    }

    const isPilotAuthorized = config.pilot_phone_numbers.some(num => {
      const normalizedNum = (num || '').replace(/\D/g, '');
      return normalizedNum === normalizedTarget && normalizedNum.length > 0;
    });

    return isPilotAuthorized ? 'v2_pilot' : 'v1';
  }

  return version || 'v1';
}
