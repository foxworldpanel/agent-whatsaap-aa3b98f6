import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { SessionStorageService } from './session-storage.service';
import { InstagramLoginResult } from './types';

export class PlaywrightSessionService {
  private static browser: Browser | null = null;

  private static async getBrowser() {
    if (!this.browser) {
      console.log(`[Playwright] Launching Chromium (HEADLESS: FALSE)...`);
      // Em ambientes de servidor/sandbox, headless: false geralmente requer um X server (DISPLAY).
      // Se o navegador "não abre", pode ser falta de permissão ou de ambiente gráfico no backend do TanStack Start.
      this.browser = await chromium.launch({ 
        headless: false,
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
      
      console.log(`[Playwright] ${new Date().toISOString()} Waiting for manual login (timeout: 5m)...`);
      
      // Aguarda o redirecionamento para o feed/home pós-login
      await page.waitForURL((url) => {
        return url.href.includes('instagram.com/') && 
               !url.href.includes('/accounts/login') && 
               !url.href.includes('/accounts/emailsignup');
      }, { timeout: 300000 });

      console.log(`[Playwright] ${new Date().toISOString()} Login success detected!`);
      await page.waitForTimeout(2000);

      const username = await this.extractUsername(page);
      const displayName = await this.extractDisplayName(page);
      const profilePic = await this.extractProfilePicture(page);
      
      console.log(`[Playwright] ${new Date().toISOString()} Extracted: @${username} (${displayName})`);

      const storageState = await context.storageState();

      await context.close();
      await browser.close();
      this.browser = null;

      if (!username) {
        return { success: false, error: "Não foi possível extrair o username após o login." };
      }

      return {
        success: true,
        username,
        display_name: displayName,
        profile_picture: profilePic,
        storageState
      };
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

  private static async extractUsername(page: Page): Promise<string | undefined> {
    try {
      return await page.evaluate(() => {
        const navProfile = document.querySelector('a[href^="/"] img[alt*="profile"]')?.closest('a')?.getAttribute('href');
        if (navProfile && navProfile !== '/') return navProfile.replace(/\//g, '');
        const sidebarLinks = Array.from(document.querySelectorAll('a'));
        const profileLink = sidebarLinks.find(a => a.innerText.toLowerCase().includes('profile') || a.innerText.toLowerCase().includes('perfil'));
        if (profileLink) return profileLink.getAttribute('href')?.replace(/\//g, '');
        return undefined;
      });
    } catch (e) {
      return undefined;
    }
  }

  private static async extractDisplayName(page: Page): Promise<string | undefined> {
    try {
      return await page.evaluate(() => {
        const titleParts = document.title.split(' • ');
        if (titleParts.length > 1) return titleParts[0];
        return undefined;
      });
    } catch (e) {
      return undefined;
    }
  }

  private static async extractProfilePicture(page: Page): Promise<string | undefined> {
    try {
      return await page.evaluate(() => {
        const img = document.querySelector('nav img[alt*="profile"]') as HTMLImageElement;
        return img?.src;
      });
    } catch (e) {
      return undefined;
    }
  }
}
