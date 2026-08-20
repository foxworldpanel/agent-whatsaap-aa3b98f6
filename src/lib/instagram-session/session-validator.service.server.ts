
export class SessionValidatorService {
  static async validate(credentialId: string): Promise<boolean> {
    if (typeof window !== 'undefined') throw new Error('Server-only');
    const { PlaywrightSessionService } = await import('./playwright-session.service.server');
    const isValid = await PlaywrightSessionService.validateSession(credentialId);
    return isValid;
  }
}
