export interface EnvironmentCheck {
  playwright: boolean;
  chromium: boolean;
  filesystem: boolean;
  storage: boolean;
  node: boolean;
  errors: string[];
}

export class EnvironmentCheckService {
  static async checkEnvironment(): Promise<EnvironmentCheck> {
    if (typeof window !== 'undefined') {
      throw new Error('EnvironmentCheckService is server-only');
    }

    const errors: string[] = [];
    const check: EnvironmentCheck = {
      playwright: false,
      chromium: false,
      filesystem: false,
      storage: false,
      node: !!process.versions.node,
      errors: []
    };

    try {
      const { chromium } = await import('playwright-core');
      check.playwright = true;
      const browser = await chromium.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      await browser.close();
      check.chromium = true;
    } catch (e: any) {
      errors.push(`Browser check failed: ${e.message}`);
    }

    try {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const testDir = '/tmp/env-check-test';
      if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      check.filesystem = true;
      check.storage = true;
    } catch (e: any) {
      errors.push(`Filesystem/Storage error: ${e.message}`);
    }

    check.errors = errors;
    return check;
  }
}
