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
  
  // Se não for uma das versões reconhecidas, fallback para v1
  if (!['v1', 'v2_shadow', 'v2_pilot', 'v2'].includes(version)) {
    return 'v1';
  }

  if (version === 'v2_pilot') {
    if (!phoneNumber || !Array.isArray(config.pilot_phone_numbers)) {
      return 'v1';
    }

    // Normalização simples para comparação (remove caracteres não numéricos)
    const normalizedTarget = phoneNumber.replace(/\D/g, '');
    const isAuthorized = config.pilot_phone_numbers.some(num => {
      const normalizedNum = (num || '').replace(/\D/g, '');
      return normalizedNum === normalizedTarget && normalizedNum.length > 0;
    });

    return isAuthorized ? 'v2_pilot' : 'v1';
  }

  return version || 'v1';
}
