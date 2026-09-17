import { describe, it, expect } from 'vitest';
import { detectConversationContext } from '@/lib/agent-v3/selector/module-selector.server';

describe('V3 Architectural Logic & Terminology', () => {
  it('treats generic plays/streams as a product without inventing a platform', () => {
    const plays = detectConversationContext("quero comprar plays");
    const streams = detectConversationContext("quero streams");

    expect(plays.product).toBe('plays');
    expect(plays.platform).toBeNull();
    expect(streams.product).toBe('plays');
    expect(streams.platform).toBeNull();
  });

  it('infers Spotify only from Spotify-exclusive listener terminology', () => {
    const listeners = detectConversationContext("ouvintes mensais");

    expect(listeners.product).toBe('ouvintes');
    expect(listeners.platform).toBe('spotify');
  });

  it('does not invent a platform from generic views', () => {
    const views = detectConversationContext("quero comprar views");

    expect(views.product).toBe('visualizacoes');
    expect(views.platform).toBeNull();
  });
});
