import { describe, it, expect } from 'vitest';
import { resolveAgentBrainVersion } from '@/lib/agent-v2/resolver';

// Estratégia oficial: V2 é o único cérebro; V1 está arquivada.
// Apenas o número autorizado (+55 11 97011-6430) executa V2.
describe('resolveAgentBrainVersion (V2-only strategy)', () => {
  it('returns v2 for the authorized number regardless of config', () => {
    expect(resolveAgentBrainVersion(null, '+55 11 97011-6430')).toBe('v2');
    expect(resolveAgentBrainVersion({}, '5511970116430')).toBe('v2');
  });

  it('returns v1 (archived) for any unauthorized number', () => {
    expect(resolveAgentBrainVersion(null, '5511999999999')).toBe('v1');
    expect(resolveAgentBrainVersion({ agent_brain_version: 'v2' }, '5511999999999')).toBe('v1');
  });

  it('returns v1 when phone is missing', () => {
    expect(resolveAgentBrainVersion(null, null)).toBe('v1');
  });
});
