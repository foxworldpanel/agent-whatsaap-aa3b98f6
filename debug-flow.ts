
import { InstagramSessionManager } from './src/lib/instagram-session/instagram-session-manager.server';
import { EnvironmentCheckService } from './src/lib/instagram-session/environment-check.service.server';

async function debugFlow() {
  console.log('--- STARTING FLOW DEBUG ---');
  
  console.log('1. Checking Environment...');
  const env = await EnvironmentCheckService.checkEnvironment();
  console.log('Environment:', JSON.stringify(env, null, 2));

  if (!env.display) {
    console.log('CRITICAL: No DISPLAY found. Browser cannot open in headed mode.');
  }

  console.log('2. Attempting connection simulation (will fail if no interaction, but checking if it starts)...');
  try {
    // This will likely timeout in CI but we want to see if it even starts the browser
    const promise = InstagramSessionManager.connect();
    
    // Give it 10 seconds to at least try to launch browser
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Manual Timeout for Debug')), 10000));
    
    await Promise.race([promise, timeout]);
  } catch (e: any) {
    console.log('Expected/Caught Error during simulation:', e.message);
  }
  
  console.log('--- DEBUG FINISHED ---');
}

debugFlow().catch(console.error);
