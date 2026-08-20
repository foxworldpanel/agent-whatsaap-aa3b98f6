// SessionStorageService should only be used server-side
export class SessionStorageService {
  private static STORAGE_DIR = '/tmp/instagram-sessions';

  static getStoragePath(credentialId: string): string {
    return `/tmp/instagram-sessions/${credentialId}.json`;
  }

  static async saveSession(credentialId: string, storageState: any): Promise<string> {
    const fs = await import('node:fs');
    if (!fs.existsSync(this.STORAGE_DIR)) {
      fs.mkdirSync(this.STORAGE_DIR, { recursive: true });
    }
    const filePath = this.getStoragePath(credentialId);
    fs.writeFileSync(filePath, JSON.stringify(storageState, null, 2));
    return filePath;
  }

  static async loadSession(credentialId: string): Promise<any | null> {
    const fs = await import('node:fs');
    const filePath = this.getStoragePath(credentialId);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }

  static async removeSession(credentialId: string): Promise<void> {
    const fs = await import('node:fs');
    const filePath = this.getStoragePath(credentialId);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  static async exists(credentialId: string): Promise<boolean> {
    const fs = await import('node:fs');
    return fs.existsSync(this.getStoragePath(credentialId));
  }
}
