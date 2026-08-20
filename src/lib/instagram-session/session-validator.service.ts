// SessionValidatorService is server-side logic wrapper
export class SessionValidatorService {
  static async validate(credentialId: string): Promise<boolean> {
    if (typeof window !== 'undefined') {
      throw new Error('SessionValidatorService is server-only');
    }
    const { PlaywrightSessionService } = await import('./playwright-session.service.server');
    return await PlaywrightSessionService.validateSession(credentialId);
  }
}
