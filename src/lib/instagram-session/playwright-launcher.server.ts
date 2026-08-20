import { type InstagramLoginResult } from './types';

const logger = (event: string, details?: any) => {
  console.log(`[PlaywrightLauncher] [${new Date().toISOString()}] ${event}`, details || '');
};

/**
 * Isolated server-only launcher to prevent Playwright leaks into client bundle.
 */
export class PlaywrightLauncher {
  private static browser: any = null;

  private static async getPlaywright() {
    if (typeof window !== 'undefined') throw new Error('PlaywrightLauncher is server-only');
    // Using indirect eval to bypass static analysis
    const indirectEval = (0, eval);
    return await indirectEval('import("playwright")');
  }

  static async launch(options: { headless?: boolean } = {}): Promise<any> {
    const { chromium } = await this.getPlaywright();
    
    const isHeaded = !!process.env.DISPLAY;
    const headless = options.headless !== undefined ? options.headless : !isHeaded;

    logger('Launching browser...', { headless });

    const browser = await chromium.launch({
      headless,
      executablePath: '/opt/ms-playwright/chromium-1194/chrome-linux/chrome',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote'
      ]
    });

    return browser;
  }
}
