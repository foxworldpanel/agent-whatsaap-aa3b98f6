// Dynamic types for Playwright to avoid client bundle issues
type Browser = any;
type BrowserContext = any;
type Page = any;
import { type InstagramLoginResult } from './types';

// O Playwright core não exporta tipos globais amigáveis a workers. 
// Usamos 'any' em tempo de execução para evitar erros de bundling de módulos Node nativos no cliente.
type BrowserRuntime = Browser;
type BrowserContextRuntime = BrowserContext;
type PageRuntime = Page;

export class PlaywrightSessionService {
  private static browser: BrowserRuntime | null = null;

  private static async getBrowser(): Promise<BrowserRuntime> {
    if (typeof window !== 'undefined') {
      throw new Error('PlaywrightSessionService is server-only');
    }

    if (!this.browser) {
      console.log(`[Playwright] ${new Date().toISOString()} Launching Chromium...`);
      // Em ambientes de servidor/sandbox, headless: true é obrigatório.
      const { chromium } = await import('playwright');
      this.browser = await chromium.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      this.browser.on('disconnected', () => {
        console.log(`[Playwright] ${new Date().toISOString()} Browser disconnected`);
        this.browser = null;
      });
    }
    return this.browser;
  }

  static async openLoginFlow(): Promise<InstagramLoginResult> {
    if (typeof window !== 'undefined') {
      throw new Error('PlaywrightSessionService.openLoginFlow is server-only');
    }

    console.log(`[Playwright] ${new Date().toISOString()} Initializing browser for login...`);
    
    let browser: BrowserRuntime | null = null;
    let context: BrowserContextRuntime | null = null;

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
      await page.waitForURL((url: any) => {
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
    if (typeof window !== 'undefined') {
      throw new Error('PlaywrightSessionService.validateSession is server-only');
    }

    const { SessionStorageService } = await import('./session-storage.service.server');
    const storageState = await SessionStorageService.loadSession(credentialId);
    if (!storageState) return false;

    let browser: BrowserRuntime | null = null;
    let context: BrowserContextRuntime | null = null;

    try {
      const { chromium } = await import('playwright');
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
    } catch (error: any) {
      console.error(`[Playwright] ${new Date().toISOString()} Validation error for ${credentialId}:`, error);
      return false;
    } finally {
      if (context) await context.close();
      if (browser) await browser.close();
    }
  }

  private static async extractUsername(page: PageRuntime): Promise<string | undefined> {
    try {
      return await page.evaluate(() => {
        const navProfile = document.querySelector('a[href^="/"] img[alt*="profile"]')?.closest('a')?.getAttribute('href');
        if (navProfile && navProfile !== '/') return navProfile.replace(/\//g, '');
        const sidebarLinks = Array.from(document.querySelectorAll('a'));
        const profileLink = sidebarLinks.find((a: any) => a.innerText.toLowerCase().includes('profile') || a.innerText.toLowerCase().includes('perfil'));
        if (profileLink) return profileLink.getAttribute('href')?.replace(/\//g, '');
        return undefined;
      });
    } catch (e) {
      return undefined;
    }
  }

  private static async extractDisplayName(page: PageRuntime): Promise<string | undefined> {
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

  private static async extractProfilePicture(page: PageRuntime): Promise<string | undefined> {
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
