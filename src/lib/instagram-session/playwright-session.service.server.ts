
type Browser = any;
type BrowserContext = any;
type Page = any;

import { type InstagramLoginResult } from './types';

const logger = (event: string, details?: any) => {
  console.log(`[Playwright] [${new Date().toISOString()}] ${event}`, details || '');
};

export class PlaywrightSessionService {
  private static browser: Browser | null = null;

  private static async getBrowser(): Promise<Browser> {
    if (typeof window !== 'undefined') {
      throw new Error('PlaywrightSessionService is server-only');
    }

    if (!this.browser) {
      const { PlaywrightLauncher } = await import('./playwright-launcher.server');
      this.browser = await PlaywrightLauncher.launch();
      
      this.browser.on('disconnected', () => {
        logger('Browser Disconnected');
        this.browser = null;
      });
    }
    return this.browser;
  }

  static async openLoginFlow(): Promise<InstagramLoginResult> {
    if (typeof window !== 'undefined') throw new Error('Server-only');
    
    let context: BrowserContext | null = null;

    try {
      logger('UI CLICK -> Server Function -> Requesting Browser...');
      const browser = await this.getBrowser();
      
      logger('Creating Context...');
      context = await browser.newContext({
        viewport: { width: 1280, height: 800 }
      });
      logger('Context Created Successfully');
      
      const page = await context.newPage();
      
      logger('Instagram Opening: Navigating to Login page...');
      await page.goto('https://www.instagram.com/accounts/login/', { 
        waitUntil: 'networkidle', 
        timeout: 60000 
      });
      logger('Instagram Opened Successfully');
      
      logger('Waiting for manual login (timeout: 5m)...');
      
      await page.waitForURL((url: any) => {
        const href = typeof url === 'string' ? url : url.href;
        return href.includes('instagram.com/') && 
               !href.includes('/accounts/login') && 
               !href.includes('/accounts/emailsignup');
      }, { timeout: 300000 });

      logger('Login success detected via URL change!');
      logger('Waiting Login completion (2s)...');
      await page.waitForTimeout(2000);

      const profile = await this.extractProfile(page);
      const storageState = await context.storageState();

      if (!profile.username) {
        throw new Error("Não foi possível extrair o username após o login.");
      }

      return {
        success: true,
        username: profile.username,
        display_name: profile.display_name,
        profile_picture: profile.profile_picture,
        storageState
      };

    } catch (error: any) {
      logger('Login Failed', error.message);
      return { success: false, error: error.message };
    } finally {
      if (context) {
        await context.close();
        logger('Context Closed');
      }
    }
  }

  static async validateSession(credentialId: string): Promise<boolean> {
    const { SessionStorageService } = await import('./session-storage.service.server');
    const storageState = await SessionStorageService.loadSession(credentialId);
    if (!storageState) {
      logger('Storage Loaded Failed', { credentialId });
      return false;
    }
    logger('Storage Loaded Success', { credentialId });

    let context: BrowserContext | null = null;
    try {
      const { PlaywrightLauncher } = await import('./playwright-launcher.server');
      const validationBrowser = await PlaywrightLauncher.launch({ headless: true });
      
      context = await validationBrowser.newContext({ storageState });
      logger('Context Created (Validation)');
      
      const page = await context.newPage();
      await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle', timeout: 30000 });
      
      const isLoggedIn = await page.evaluate(() => {
        return !!document.querySelector('nav') || 
               !!document.querySelector('svg[aria-label="Home"]') || 
               !!document.querySelector('svg[aria-label="Página inicial"]');
      });
      
      await validationBrowser.close();
      return isLoggedIn;
    } catch (error: any) {
      logger('Validation Failed', error.message);
      return false;
    } finally {
      if (context) await context.close();
    }
  }

  private static async extractProfile(page: Page): Promise<Partial<InstagramLoginResult>> {
    logger('Extracting Profile data...');
    return await page.evaluate(() => {
      const navProfile = document.querySelector('a[href^="/"] img[alt*="profile"]')?.closest('a')?.getAttribute('href');
      let username = navProfile ? navProfile.replace(/\//g, '') : undefined;
      
      if (!username) {
        const profileLink = document.querySelector('svg[aria-label="Profile"], svg[aria-label="Perfil"]')?.closest('a')?.getAttribute('href');
        username = profileLink ? profileLink.replace(/\//g, '') : undefined;
      }

      const titleParts = document.title.split(' • ');
      let display_name = titleParts.length > 1 ? titleParts[0] : undefined;
      
      const img = document.querySelector('nav img[alt*="profile"], img[alt*="profile picture"]') as HTMLImageElement;
      
      return { username, display_name, profile_picture: img?.src };
    });
  }
}
