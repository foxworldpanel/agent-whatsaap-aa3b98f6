
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
    if (typeof window !== 'undefined') throw new Error('Server-only');

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
      const { PlaywrightLauncher } = await import('./playwright-launcher.server');
      const browser = await PlaywrightLauncher.launch({ headless: true });
      check.playwright = true;
      check.chromium = true;
      await browser.close();
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
