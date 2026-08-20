import fs from 'fs';
import path from 'path';

export class SessionStorageService {
  private static STORAGE_DIR = '/tmp/instagram-sessions';

  static ensureDir() {
    if (!fs.existsSync(this.STORAGE_DIR)) {
      fs.mkdirSync(this.STORAGE_DIR, { recursive: true });
    }
  }

  static getStoragePath(credentialId: string): string {
    return path.join(this.STORAGE_DIR, `${credentialId}.json`);
  }

  static async saveSession(credentialId: string, storageState: any): Promise<string> {
    this.ensureDir();
    const filePath = this.getStoragePath(credentialId);
    fs.writeFileSync(filePath, JSON.stringify(storageState, null, 2));
    return filePath;
  }

  static async loadSession(credentialId: string): Promise<any | null> {
    const filePath = this.getStoragePath(credentialId);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }

  static async removeSession(credentialId: string): Promise<void> {
    const filePath = this.getStoragePath(credentialId);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  static exists(credentialId: string): boolean {
    return fs.existsSync(this.getStoragePath(credentialId));
  }
}
