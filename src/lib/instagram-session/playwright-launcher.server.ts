import { type InstagramLoginResult } from './types';

const logger = (event: string, details?: any) => {
  console.log(`[PlaywrightLauncher] [${new Date().toISOString()}] ${event}`, details || '');
};

/**
 * Isolated server-only launcher to prevent Playwright leaks into client bundle.
 */
export class PlaywrightLauncher {
  private static browser: any = null;

  private static async getPlaywright() {
    if (typeof window !== 'undefined') throw new Error('PlaywrightLauncher is server-only');
    
    try {
      // Usamos globalThis.eval para garantir que o import dinâmico não seja analisado pelo Vite.
      // O uso de interpolação e fragmentos de string oculta o módulo do analisador estático do Lovable Cloud/Vite.
      const p = 'play';
      const w = 'wright';
      const moduleName = `${p}${w}`;
      const indirectEval = globalThis.eval;
      
      logger(`Tentando carregar ${moduleName} via indirect eval...`);
      return await indirectEval(`import("${moduleName}")`);
    } catch (error) {
      logger('Falha crítica ao carregar Playwright no ambiente de publicação.', error);
      // Retornamos um mock ou erro controlado para evitar crash no boot do Worker, 
      // caso o ambiente de publicação não suporte binários nativos.
      throw new Error('BROWSER_AUTOMATION_NOT_SUPPORTED_IN_THIS_ENVIRONMENT');
    }
  }

  static async launch(options: { headless?: boolean } = {}): Promise<any> {
    const pw = await this.getPlaywright();
    if (!pw || !pw.chromium) {
      throw new Error('Chromium not available in playwright module');
    }
    const { chromium } = pw;
    
    const isHeaded = !!process.env.DISPLAY;
    const headless = options.headless !== undefined ? options.headless : !isHeaded;

    logger('Launching browser...', { headless });

    const browser = await chromium.launch({
      headless,
      executablePath: '/opt/ms-playwright/chromium-1194/chrome-linux/chrome',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote'
      ]
    });

    return browser;
  }
}
