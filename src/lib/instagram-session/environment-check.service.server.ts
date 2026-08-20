
export interface EnvironmentCheck {
  playwright: boolean;
  chromium: boolean;
  filesystem: boolean;
  storage: boolean;
  node: boolean;
  display: boolean;
  writable: boolean;
  errors: string[];
  timestamp: string;
}

export class EnvironmentCheckService {
  static async checkEnvironment(): Promise<EnvironmentCheck> {
    const { isBrowser } = await import('@/lib/utils');
    if (isBrowser) throw new Error('Server-only');

    const errors: string[] = [];
    const check: EnvironmentCheck = {
      playwright: false,
      chromium: false,
      filesystem: false,
      storage: false,
      node: !!process.versions.node,
      display: !!process.env.DISPLAY,
      writable: false,
      errors: [],
      timestamp: new Date().toISOString()
    };

    // 1. Playwright & Chromium
    try {
      const { chromium } = await import('playwright');
      check.playwright = true;
      const browser = await chromium.launch({ 
        headless: true,
        executablePath: '/opt/ms-playwright/chromium-1194/chrome-linux/chrome',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      await browser.close();
      check.chromium = true;
    } catch (e: any) {
      errors.push(`Playwright/Chromium: ${e.message}`);
    }

    // 2. Filesystem & Writable
    try {
      const fs = await import('node:fs');
      const testDir = '/tmp/instagram-session-check';
      if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
      const testFile = `${testDir}/write-test.tmp`;
      fs.writeFileSync(testFile, 'ok');
      fs.unlinkSync(testFile);
      check.filesystem = true;
      check.writable = true;
      check.storage = true;
    } catch (e: any) {
      errors.push(`Filesystem: ${e.message}`);
    }

    check.errors = errors;
    console.log('[EnvironmentCheck]', check);
    return check;
  }
}
