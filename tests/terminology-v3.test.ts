import { describe, it, expect, vi } from 'vitest';
import { selectRelevantModules } from './module-selector.server';

describe('V3 Architectural Logic & Terminology', () => {
  it('should explicitly confirm Spotify when "plays" is mentioned', () => {
    const input = "quero comprar plays";
    const enabledModules = ['spotify', 'youtube', 'instagram', 'fluxo_vendas'];
    
    const selectedKeys = selectRelevantModules(input, enabledModules);
    
    expect(selectedKeys).toContain('spotify');
    expect(selectedKeys).toContain('fluxo_vendas');
    // Note: 'plays' is mapped to spotify in KEYWORD_MAP, 
    // and selectRelevantModules handles the addition.
  });

  it('should explicitly confirm Spotify when "streams" or "ouvintes" is mentioned', () => {
    const enabledModules = ['spotify', 'fluxo_vendas'];
    
    expect(selectRelevantModules("quero streams", enabledModules)).toContain('spotify');
    expect(selectRelevantModules("ouvintes mensais", enabledModules)).toContain('spotify');
  });

  it('should not confuse "views" with Spotify if not enabled', () => {
    const input = "quero comprar views";
    const enabledModules = ['youtube', 'instagram', 'fluxo_vendas'];
    
    const selectedKeys = selectRelevantModules(input, enabledModules);
    
    expect(selectedKeys).not.toContain('spotify');
    // It should pick youtube or instagram based on keywords
    expect(selectedKeys.some(k => ['youtube', 'instagram'].includes(k))).toBe(true);
  });
});
