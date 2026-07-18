import { describe, it, expect } from 'vitest';
import { buildSharedRules } from '../src/lib/agent-identity.server';

describe('Prompt Caching 2.0 - Block 1 Stability', () => {
  const mockIdentity = {
    persona: 'Sou a Júlia',
    regra_emoji: 'Emojis ok',
    regra_split: 'Split ok',
    terminologia_redes: 'Terminologia ok',
    regra_teste_gratis: 'Teste ok',
    regra_anti_invencao: 'Anti-invenção ok',
    exemplo_disparo: 'Disparo ok',
    reconhecimento_interesse: 'Interesse ok',
    regra_encerramento: 'Encerramento ok',
    regra_estilo_escrita: 'Estilo ok',
  };

  it('Block 1 should be identical regardless of playlistCatalog or dailyPromoText changes', () => {
    const blockA = buildSharedRules(mockIdentity as any, {
      playlistCatalog: { ecletica: ['p1'], eletronica: [] },
      dailyPromoText: 'Promo 1',
      suppressExemploDisparo: true
    });

    const blockB = buildSharedRules(mockIdentity as any, {
      playlistCatalog: null as any,
      dailyPromoText: null as any,
      suppressExemploDisparo: true
    });

    expect(blockA).toBe(blockB);
    console.log('STABILITY CHECK: Block 1 is identical across varying dynamic inputs.');
  });
});
