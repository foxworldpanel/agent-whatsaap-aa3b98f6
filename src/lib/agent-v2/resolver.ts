/**
 * Agent Mind V2 — Resolvedor de Versão
 *
 * Estratégia oficial: a V2 é o cérebro ÚNICO. A V1 está arquivada.
 * Só o número autorizado (ver `authorized-phones.ts`) executa V2.
 * Qualquer outro número recebe 'v1' aqui, mas o webhook já bloqueia
 * antes de chegar a esse resolver — nenhum custo de IA é gerado.
 *
 * Shadow Mode e comparação V1 x V2 foram REMOVIDOS.
 */

import { ActiveBrainVersion } from './types';
import { isAuthorizedV2Phone } from './authorized-phones';

export interface AgentConfig {
  agent_brain_version?: string;
  // Campos legados mantidos apenas para compatibilidade de tipo:
  pilot_phone_numbers?: string[];
  v2_shadow_phone_numbers?: string[];
}

/**
 * Resolve qual versão do cérebro deve ser utilizada para uma chamada.
 *
 * Regras atuais:
 * - Número autorizado → 'v2' (única versão executada).
 * - Qualquer outro número → 'v1' (arquivada; nunca deve rodar — o
 *   webhook filtra antes de chegar aqui).
 */
export function resolveAgentBrainVersion(
  _config: AgentConfig | null | undefined,
  phoneNumber: string | null | undefined
): ActiveBrainVersion {
  return isAuthorizedV2Phone(phoneNumber) ? 'v2' : 'disabled';
}
