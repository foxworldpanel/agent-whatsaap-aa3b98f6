import { describe, it, expect } from 'vitest';
import { resolveAgentBrainVersion } from '../resolver';

describe('resolveAgentBrainVersion', () => {
  it('should return v1 if config is missing', () => {
    expect(resolveAgentBrainVersion(null, '5511999999999')).toBe('v1');
  });

  it('should return v1 if version is invalid', () => {
    expect(resolveAgentBrainVersion({ agent_brain_version: 'invalid' as any }, '5511999999999')).toBe('v1');
  });

  it('should return v2_shadow when configured', () => {
    expect(resolveAgentBrainVersion({ agent_brain_version: 'v2_shadow' }, '5511999999999')).toBe('v2_shadow');
  });

  it('should return v2 when configured', () => {
    expect(resolveAgentBrainVersion({ agent_brain_version: 'v2' }, '5511999999999')).toBe('v2');
  });

  describe('v2_pilot mode', () => {
    const pilotConfig = {
      agent_brain_version: 'v2_pilot',
      pilot_phone_numbers: ['5511999999999', '+55 (11) 88888-8888']
    };

    it('should return v2_pilot for authorized number', () => {
      expect(resolveAgentBrainVersion(pilotConfig, '5511999999999')).toBe('v2_pilot');
    });

    it('should return v2_pilot for authorized number with different formatting', () => {
      expect(resolveAgentBrainVersion(pilotConfig, '5511888888888')).toBe('v2_pilot');
    });

    it('should return v1 for unauthorized number', () => {
      expect(resolveAgentBrainVersion(pilotConfig, '5511777777777')).toBe('v1');
    });

    it('should return v1 if phone number is missing', () => {
      expect(resolveAgentBrainVersion(pilotConfig, null)).toBe('v1');
    });

    it('should return v1 if pilot list is missing', () => {
      expect(resolveAgentBrainVersion({ agent_brain_version: 'v2_pilot' }, '5511999999999')).toBe('v1');
    });
  });
});
