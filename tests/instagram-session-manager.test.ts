
import { EnvironmentCheckService } from '../src/lib/instagram-session/environment-check.service.server';
import { PlaywrightSessionService } from '../src/lib/instagram-session/playwright-session.service.server';
import { SessionStorageService } from '../src/lib/instagram-session/session-storage.service.server';

async function testManager() {
  console.log('--- STARTING INTEGRATION TEST ---');
  
  // 1. Environment Check
  console.log('1. Checking Environment...');
  const env = await EnvironmentCheckService.checkEnvironment();
  console.log('Environment Check Result:', JSON.stringify(env, null, 2));

  // 2. Playwright Lifecycle
  console.log('2. Testing Playwright Lifecycle (Headless Mode for Test)...');
  // We use headless: true for automated validation of the binary, 
  // though the official mode for USER login is headless: false.
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ 
      headless: true,
      executablePath: '/opt/ms-playwright/chromium-1194/chrome-linux/chrome',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    console.log('Chromium Launch OK');
    await browser.close();
  } catch (e) {
    console.error('Chromium Launch Failed:', e);
    process.exit(1);
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
