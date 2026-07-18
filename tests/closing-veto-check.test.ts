import { describe, it, expect } from 'vitest';
import { mergeIdentity } from '../src/lib/agent-identity.server';

describe('Closing Veto Rule Check', () => {
  it('should contain the PERGUNTA DE DESCOBERTA NO FECHAMENTO (VETO) rule', () => {
    const identity = mergeIdentity({});
    expect(identity.regra_anti_invencao).toContain('PERGUNTA DE DESCOBERTA NO FECHAMENTO (VETO)');
    console.log('VETO CHECK: Rule is present in anti-invention block.');
  });
});
