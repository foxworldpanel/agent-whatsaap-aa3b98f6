import { describe, it, expect, vi } from 'vitest';
import { resolveAgentBrainVersion } from '@/lib/agent-v2/resolver';
import { isAuthorizedV2Phone } from '@/lib/agent-v2/authorized-phones';

/**
 * Estratégia oficial:
 * - Número autorizado (+55 11 97011-6430) → 'v2'
 * - Qualquer outro número                 → 'disabled'
 * A V1 NUNCA é retornada pelo resolver ativo.
 */
describe('resolveAgentBrainVersion (V2-only + disabled)', () => {
  const AUTHORIZED_RAW = '+55 11 97011-6430';
  const AUTHORIZED_DIGITS = '5511970116430';

  it('authorized number → v2', () => {
    expect(resolveAgentBrainVersion(null, AUTHORIZED_DIGITS)).toBe('v2');
  });

  it('unauthorized number → disabled', () => {
    expect(resolveAgentBrainVersion(null, '5511999999999')).toBe('disabled');
  });

  it('masked/spaced phone is normalized correctly', () => {
    expect(resolveAgentBrainVersion(null, AUTHORIZED_RAW)).toBe('v2');
    expect(resolveAgentBrainVersion(null, '  +55 (11) 97011-6430  ')).toBe('v2');
  });

  it('similar-but-different number → disabled', () => {
    // último dígito trocado
    expect(resolveAgentBrainVersion(null, '5511970116431')).toBe('disabled');
    // prefixo diferente
    expect(resolveAgentBrainVersion(null, '5521970116430')).toBe('disabled');
  });

  it('empty phone → disabled', () => {
    expect(resolveAgentBrainVersion(null, '')).toBe('disabled');
    expect(resolveAgentBrainVersion(null, null)).toBe('disabled');
    expect(resolveAgentBrainVersion(null, undefined)).toBe('disabled');
  });

  it('missing config → disabled for unauthorized, v2 for authorized', () => {
    expect(resolveAgentBrainVersion(undefined, '5511999999999')).toBe('disabled');
    expect(resolveAgentBrainVersion(undefined, AUTHORIZED_DIGITS)).toBe('v2');
  });

  it('resolver never returns v1/v2_shadow/v2_pilot', () => {
    const samples = ['', '5511970116430', '5511999999999', '+55 11 97011-6430', null];
    for (const p of samples) {
      const v = resolveAgentBrainVersion(null, p);
      expect(['v2', 'disabled']).toContain(v);
      expect(v).not.toBe('v1');
    }
  });

  it('helper isAuthorizedV2Phone matches resolver', () => {
    expect(isAuthorizedV2Phone(AUTHORIZED_DIGITS)).toBe(true);
    expect(isAuthorizedV2Phone('5511999999999')).toBe(false);
  });
});

/**
 * Contrato de execução: quando o resolver retorna 'disabled',
 * NENHUMA rota de IA (V1, V2, ferramentas ou métricas) pode ser invocada.
 *
 * Simulamos o gate do webhook: só executa qualquer callable se
 * activeVersion === 'v2'. Verificamos que nenhum spy é chamado.
 */
describe('disabled contract — nothing gets called', () => {
  const callAgentV1 = vi.fn();
  const callAgentV2 = vi.fn();
  const callTool = vi.fn();
  const recordAiMetric = vi.fn();

  function gate(phone: string | null) {
    const active = resolveAgentBrainVersion(null, phone);
    if (active !== 'v2') return; // segunda camada de defesa
    callAgentV2();
    callTool();
    recordAiMetric();
  }

  it('disabled never calls AgentV1', () => {
    callAgentV1.mockClear();
    gate('5511999999999');
    expect(callAgentV1).not.toHaveBeenCalled();
  });

  it('disabled never calls AgentV2', () => {
    callAgentV2.mockClear();
    gate('5511999999999');
    expect(callAgentV2).not.toHaveBeenCalled();
  });

  it('disabled never calls tools', () => {
    callTool.mockClear();
    gate('');
    gate(null);
    gate('5511970116431');
    expect(callTool).not.toHaveBeenCalled();
  });

  it('disabled never records AI metrics', () => {
    recordAiMetric.mockClear();
    gate('5511999999999');
    expect(recordAiMetric).not.toHaveBeenCalled();
  });

  it('authorized number DOES execute V2 path', () => {
    callAgentV2.mockClear();
    callTool.mockClear();
    recordAiMetric.mockClear();
    gate('+55 11 97011-6430');
    expect(callAgentV2).toHaveBeenCalledTimes(1);
    expect(callTool).toHaveBeenCalledTimes(1);
    expect(recordAiMetric).toHaveBeenCalledTimes(1);
  });
});
