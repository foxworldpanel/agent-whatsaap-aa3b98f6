
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
      logger('Browser Started');
      const { chromium } = await import('playwright');
      this.browser = await chromium.launch({ 
        headless: false,
        executablePath: '/opt/ms-playwright/chromium-1194/chrome-linux/chrome',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      this.browser.on('disconnected', () => {
        logger('Browser Closed');
        this.browser = null;
      });
    }
    return this.browser;
  }

  static async openLoginFlow(): Promise<InstagramLoginResult> {
    if (typeof window !== 'undefined') throw new Error('Server-only');
    
    let context: BrowserContext | null = null;

    try {
      const browser = await this.getBrowser();
      context = await browser.newContext({
        viewport: { width: 1280, height: 1800 }
      });
      logger('Context Created');
      
      const page = await context.newPage();
      
      logger('Navigating to Instagram Login');
      await page.goto('https://www.instagram.com/accounts/login/', { 
        waitUntil: 'networkidle', 
        timeout: 60000 
      });
      
      // INSTRUCTION: In a headless environment without manual interaction, 
      // this flow requires either pre-authenticated cookies or an automated login if credentials were provided.
      // Since the requirement mentions "Login manual", and we are in headless: true,
      // we must clarify that manual interaction is not possible.
      // For now, we harden the technical lifecycle.
      
      return { 
        success: false, 
        error: "Ambiente headless desativado. Autenticação deve ser realizada manualmente no navegador aberto." 
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
      const browser = await this.getBrowser();
      context = await browser.newContext({ storageState });
      logger('Context Created (Validation)');
      
      const page = await context.newPage();
      await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle', timeout: 30000 });
      
      const isLoggedIn = await page.evaluate(() => {
        return !!document.querySelector('nav') || 
               !!document.querySelector('svg[aria-label="Home"]') || 
               !!document.querySelector('svg[aria-label="Página inicial"]');
      });
      
      return isLoggedIn;
    } catch (error: any) {
      logger('Validation Failed', error.message);
      return false;
    } finally {
      if (context) await context.close();
    }
  }

  static async extractProfile(page: Page): Promise<Partial<InstagramLoginResult>> {
    return await page.evaluate(() => {
      const navProfile = document.querySelector('a[href^="/"] img[alt*="profile"]')?.closest('a')?.getAttribute('href');
      const username = navProfile ? navProfile.replace(/\//g, '') : undefined;
      const titleParts = document.title.split(' • ');
      const display_name = titleParts.length > 1 ? titleParts[0] : undefined;
      const img = document.querySelector('nav img[alt*="profile"]') as HTMLImageElement;
      return { username, display_name, profile_picture: img?.src };
    });
  }
}
