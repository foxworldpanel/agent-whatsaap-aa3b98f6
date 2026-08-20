import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { SessionStorageService } from './session-storage.service';
import { InstagramLoginResult } from './types';

export class PlaywrightSessionService {
  private static browser: Browser | null = null;

  private static async getBrowser() {
    if (!this.browser) {
      console.log(`[Playwright] Launching Chromium (HEADLESS: TRUE)...`);
      this.browser = await chromium.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }
    return this.browser;
  }

  static async openLoginFlow(): Promise<InstagramLoginResult> {
    console.log(`[Playwright] ${new Date().toISOString()} Initializing browser for login...`);
    
    let browser: Browser | null = null;
    let context: BrowserContext | null = null;

    try {
      browser = await this.getBrowser();
      context = await browser.newContext({
        viewport: { width: 1280, height: 800 }
      });
      const page = await context.newPage();

      console.log(`[Playwright] Navigating to Instagram...`);
      await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle', timeout: 60000 });
      
      // Since it's headless, manual login is impossible.
      // We throw a clear error to confirm the server function IS running.
      throw new Error("O navegador abriu no servidor (HEADLESS), mas o login manual requer um navegador visível. Erro esperado para diagnóstico.");

    } catch (error: any) {
      console.error(`[Playwright] ${new Date().toISOString()} Login flow error:`, error);
      if (context) await context.close();
      if (browser) await browser.close();
      this.browser = null;
      return { success: false, error: error.message || "Erro desconhecido no fluxo do Playwright" };
    }
  }

  static async validateSession(credentialId: string): Promise<boolean> {
    const storageState = await SessionStorageService.loadSession(credentialId);
    if (!storageState) return false;
    let browser: Browser | null = null;
    let context: BrowserContext | null = null;
    try {
      browser = await chromium.launch({ headless: true });
      context = await browser.newContext({ storageState });
      const page = await context.newPage();
      await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle', timeout: 30000 });
      const isLoggedIn = await page.evaluate(() => {
        const hasNav = !!document.querySelector('nav');
        const hasHome = !!document.querySelector('svg[aria-label="Home"]') || !!document.querySelector('svg[aria-label="Página inicial"]');
        const hasLoginButton = !!document.querySelector('button:has-text("Log In")') || !!document.querySelector('button:has-text("Entrar")');
        return (hasNav || hasHome) && !hasLoginButton;
      });
      return isLoggedIn;
    } catch (error) {
      return false;
    } finally {
      if (context) await context.close();
      if (browser) await browser.close();
    }
  }

  private static async extractUsername(page: Page): Promise<string | undefined> { return undefined; }
  private static async extractDisplayName(page: Page): Promise<string | undefined> { return undefined; }
  private static async extractProfilePicture(page: Page): Promise<string | undefined> { return undefined; }
}
