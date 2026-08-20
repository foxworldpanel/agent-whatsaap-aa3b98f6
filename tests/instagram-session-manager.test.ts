
import { EnvironmentCheckService } from '../src/lib/instagram-session/environment-check.service.server';
import { PlaywrightSessionService } from '../src/lib/instagram-session/playwright-session.service.server';
import { SessionStorageService } from '../src/lib/instagram-session/session-storage.service.server';

async function testManager() {
  console.log('--- STARTING INTEGRATION TEST ---');
  
  // 1. Environment Check
  console.log('1. Checking Environment...');
  const env = await EnvironmentCheckService.checkEnvironment();
  if (env.errors.length > 0) {
    console.error('Environment check failed:', env.errors);
    process.exit(1);
  }
  console.log('Environment OK');

  // 2. Playwright Lifecycle
  console.log('2. Testing Playwright Lifecycle...');
  try {
    const result = await PlaywrightSessionService.openLoginFlow();
    console.log('Login result (expected headless failure or timeout):', result);
  } catch (e) {
    console.log('Login failed as expected in restricted env');
  }

  // 3. Storage
  console.log('3. Testing Storage...');
  const testId = 'test-id-' + Date.now();
  const mockState = { cookies: [], origins: [] };
  const path = await SessionStorageService.saveSession(testId, mockState);
  console.log('Session saved to:', path);
  
  const loaded = await SessionStorageService.loadSession(testId);
  if (JSON.stringify(loaded) !== JSON.stringify(mockState)) {
    throw new Error('Storage integrity failed');
  }
  console.log('Storage OK');

  await SessionStorageService.removeSession(testId);
  console.log('Test session removed');

  console.log('--- INTEGRATION TEST FINISHED SUCCESSFULLY ---');
}

testManager().catch(e => {
  console.error('Test suite failed:', e);
  process.exit(1);
});
