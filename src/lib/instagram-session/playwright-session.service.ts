import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { SessionStorageService } from './session-storage.service';
import { InstagramLoginResult } from './types';

export class PlaywrightSessionService {
  private static browser: Browser | null = null;

  private static async getBrowser() {
    if (!this.browser) {
      // headless: false is critical for manual login as per requirement.
      this.browser = await chromium.launch({ headless: false });
    }
    return this.browser;
  }

  static async openLoginFlow(): Promise<InstagramLoginResult> {
    console.log(`[Playwright] ${new Date().toISOString()} Initializing browser for login...`);
    const browser = await this.getBrowser();
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle' });
      
      console.log(`[Playwright] ${new Date().toISOString()} Waiting for manual login (timeout: 5m)...`);
      
      // Wait for the feed or profile page, indicating success
      await page.waitForURL((url) => {
        return url.href.includes('instagram.com/') && 
               !url.href.includes('/accounts/login') && 
               !url.href.includes('/accounts/emailsignup');
      }, { timeout: 300000 });

      console.log(`[Playwright] ${new Date().toISOString()} Login success detected!`);

      // Give a tiny bit of time for UI to settle for extraction
      await page.waitForTimeout(2000);

      // Extract user info
      const username = await this.extractUsername(page);
      const displayName = await this.extractDisplayName(page);
      const profilePic = await this.extractProfilePicture(page);
      
      console.log(`[Playwright] ${new Date().toISOString()} Extracted: @${username} (${displayName})`);

      // Capture storage state to return to manager
      const storageState = await context.storageState();

      // Close browser IMMEDIATELY after capturing state
      await context.close();
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }

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
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
      return { success: false, error: error.message || "Erro desconhecido no fluxo do Playwright" };
    }
  }

  static async validateSession(credentialId: string): Promise<boolean> {
    console.log(`[Playwright] ${new Date().toISOString()} Starting real validation for ${credentialId}`);
    const storageState = await SessionStorageService.loadSession(credentialId);
    if (!storageState) {
      console.warn(`[Playwright] ${new Date().toISOString()} No storage state found for ${credentialId}`);
      return false;
    }

    const browser = await this.getBrowser();
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();

    try {
      // Navigate to personal profile or home
      await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle' });
      
      // Check for logged-in indicators
      const isLoggedIn = await page.evaluate(() => {
        const hasNav = !!document.querySelector('nav');
        const hasHome = !!document.querySelector('svg[aria-label="Home"]') || !!document.querySelector('svg[aria-label="Página inicial"]');
        const hasLoginButton = !!document.querySelector('button:has-text("Log In")') || !!document.querySelector('button:has-text("Entrar")');
        return (hasNav || hasHome) && !hasLoginButton;
      });
      
      console.log(`[Playwright] ${new Date().toISOString()} Validation for ${credentialId}: ${isLoggedIn}`);
      return isLoggedIn;
    } catch (error) {
      console.error(`[Playwright] ${new Date().toISOString()} Validation error for ${credentialId}:`, error);
      return false;
    } finally {
      await context.close();
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
    }
  }

  private static async extractUsername(page: Page): Promise<string | undefined> {
    try {
      return await page.evaluate(() => {
        // Look for username in various common places
        const navProfile = document.querySelector('a[href^="/"] img[alt*="profile"]')?.closest('a')?.getAttribute('href');
        if (navProfile && navProfile !== '/') return navProfile.replace(/\//g, '');
        
        // Alternative: look for profile link in sidebar
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
      // To get display name reliably we might need to be on the profile page, 
      // but sometimes it's in the title or sidebar.
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
