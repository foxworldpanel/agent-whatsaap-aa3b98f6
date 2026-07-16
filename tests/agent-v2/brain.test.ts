import { describe, it, expect } from 'vitest';
import { AgentBrainV2 } from '@/lib/agent-v2/brain';


describe('AgentBrainV2', () => {
  it('should initialize in shadow mode and return stub response', async () => {
    const brain = new AgentBrainV2();
    const result = await brain.process("Olá", "test-conv");
    
    expect(result.state.version).toBe('v2');
    expect(result.state.mode).toBe('shadow');
    expect(result.response).toContain('Shadow Mode');
  });
});
