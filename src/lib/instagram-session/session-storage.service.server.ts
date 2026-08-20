
export class SessionStorageService {
  private static STORAGE_DIR = '/tmp/instagram-sessions';

  private static async getFs() {
    return await import('node:fs');
  }

  static getStoragePath(credentialId: string): string {
    return `${this.STORAGE_DIR}/${credentialId}.json`;
  }

  static async saveSession(credentialId: string, storageState: any): Promise<string> {
    const fs = await this.getFs();
    if (!fs.existsSync(this.STORAGE_DIR)) {
      fs.mkdirSync(this.STORAGE_DIR, { recursive: true });
    }
    const filePath = this.getStoragePath(credentialId);
    fs.writeFileSync(filePath, JSON.stringify(storageState, null, 2));
    return filePath;
  }

  static async loadSession(credentialId: string): Promise<any | null> {
    const fs = await this.getFs();
    const filePath = this.getStoragePath(credentialId);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }

  static async removeSession(credentialId: string): Promise<void> {
    const fs = await this.getFs();
    const filePath = this.getStoragePath(credentialId);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  static async exists(credentialId: string): Promise<boolean> {
    const fs = await this.getFs();
    return fs.existsSync(this.getStoragePath(credentialId));
  }

  static async cleanOrphanFiles(validIds: string[]): Promise<number> {
    const fs = await this.getFs();
    if (!fs.existsSync(this.STORAGE_DIR)) return 0;
    
    const files = fs.readdirSync(this.STORAGE_DIR);
    let removed = 0;
    for (const file of files) {
      const id = file.replace('.json', '');
      if (!validIds.includes(id)) {
        fs.unlinkSync(`${this.STORAGE_DIR}/${file}`);
        removed++;
      }
    }
    return removed;
  }
}
