import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { SessionStorageService } from './session-storage.service';
import { InstagramLoginResult } from './types';

export class PlaywrightSessionService {
  private static browser: Browser | null = null;

  private static async getBrowser() {
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: true });
    }
    return this.browser;
  }

  static async openLoginFlow(credentialId: string): Promise<InstagramLoginResult> {
    const browser = await this.getBrowser();
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle' });
      
      console.log(`[Playwright] Waiting for manual login for credential ${credentialId}...`);
      
      // Wait for navigation to a page that indicates successful login (like the feed)
      // or check for specific elements that appear only when logged in.
      // We'll wait up to 5 minutes for the user to complete login manually.
      await page.waitForURL((url) => {
        return url.href.includes('instagram.com/') && !url.href.includes('/accounts/login');
      }, { timeout: 300000 });

      console.log('[Playwright] Login detected!');

      // Extract user info
      const username = await this.extractUsername(page);
      const displayName = await this.extractDisplayName(page);
      
      // Save storage state
      const storageState = await context.storageState();
      await SessionStorageService.saveSession(credentialId, storageState);

      return {
        success: true,
        username,
        display_name: displayName,
      };
    } catch (error: any) {
      console.error('[Playwright] Login flow failed:', error);
      return { success: false, error: error.message };
    } finally {
      await context.close();
    }
  }

  static async validateSession(credentialId: string): Promise<boolean> {
    const storageState = await SessionStorageService.loadSession(credentialId);
    if (!storageState) return false;

    const browser = await this.getBrowser();
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();

    try {
      await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle' });
      const isLoggedIn = await page.evaluate(() => {
        return !!document.querySelector('nav') || !!document.querySelector('[aria-label="Home"]');
      });
      return isLoggedIn;
    } catch (error) {
      return false;
    } finally {
      await context.close();
    }
  }

  private static async extractUsername(page: Page): Promise<string | undefined> {
    try {
      // Try to find the profile link which usually contains the username
      const username = await page.evaluate(() => {
        const profileLink = document.querySelector('a[href^="/"] img[alt*="profile"]')?.closest('a')?.getAttribute('href');
        return profileLink?.replace(/\//g, '');
      });
      return username || undefined;
    } catch (e) {
      return undefined;
    }
  }

  private static async extractDisplayName(page: Page): Promise<string | undefined> {
    // This is harder to get without going to the profile page
    return undefined;
  }
}
